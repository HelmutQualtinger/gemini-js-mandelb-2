import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Viewport, PaletteType } from '../types';

interface HoverInfo {
  re: number;
  im: number;
  iterations: number;
}

/** Öffentliche Methoden, die der Canvas nach außen freigibt (via forwardRef) */
export interface MandelbrotCanvasHandle {
  captureHighRes: (width: number, height: number) => Promise<Blob>;
}

interface Props {
  viewport: Viewport;
  maxIterations: number;
  palette: PaletteType;
  paletteRepeat: number;
  onViewChange: (newView: Viewport) => void;
  onHover?: (info: HoverInfo | null) => void;
}

// --- WebGL2 Shader-Quellcode ---

/**
 * Vertex-Shader: Zeichnet ein Vollbild-Quad (zwei Dreiecke = ganzer Bildschirm).
 * Die eigentliche Fraktal-Berechnung findet im Fragment-Shader statt.
 */
const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0, 1);
}
`;

/**
 * Fragment-Shader: Berechnet pro Pixel die Mandelbrot-Iteration in
 * doppelt-genauer Gleitkomma-Arithmetik (Double-Single / DS).
 *
 * Warum DS-Arithmetik?
 * GPU-Shader arbeiten nativ nur mit float32 (~7 Dezimalstellen Genauigkeit).
 * Beim tiefen Hineinzoomen ins Mandelbrot-Set wird mehr Präzision benötigt.
 * Die DS-Technik emuliert float64 durch zwei float32-Werte (hi + lo),
 * was Zoom-Level bis ~1e13 ohne sichtbares Pixelrauschen ermöglicht.
 */
const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_center_x; // DS-Zahl: Realteil des Zentrums (hi, lo)
uniform vec2 u_center_y; // DS-Zahl: Imaginärteil des Zentrums (hi, lo)
uniform vec2 u_scale;    // DS-Zahl: Skalierung (Sichtfenster-Breite in komplexen Einheiten)
uniform int u_maxIterations;
uniform int u_paletteType;
uniform float u_paletteRepeat;

out vec4 outColor;

// --- DS-Arithmetik (Double-Single) ---
// Jede DS-Zahl ist ein vec2: x = high-Teil, y = low-Teil (Fehlerkorrektur)

vec2 ds_set(float a) { return vec2(a, 0.0); }

// Fehlerkompensierende Addition (Knuth / Dekker Algorithmus)
vec2 ds_add(vec2 d1, vec2 d2) {
    float s = d1.x + d2.x;
    float t = s - d1.x;
    float e = (d1.x - (s - t)) + (d2.x - t);
    e += d1.y + d2.y;
    float s2 = s + e;
    float e2 = e - (s2 - s);
    return vec2(s2, e2);
}

vec2 ds_sub(vec2 d1, vec2 d2) {
    return ds_add(d1, vec2(-d2.x, -d2.y));
}

// Fehlerkompensierende Multiplikation
vec2 ds_mul(vec2 d1, vec2 d2) {
    float c11 = d1.x * d2.x;
    float c21 = d1.x * d2.y + d1.y * d2.x;
    float s1 = c11 + c21;
    float e1 = c21 - (s1 - c11);
    return vec2(s1, e1);
}

/**
 * Gibt eine RGB-Farbe für den normierten Iterationswert t ∈ [0,1] zurück.
 * u_paletteRepeat steuert wie oft die Palette wiederholt wird (fract).
 * Jede Palette ist als analytische GLSL-Funktion implementiert.
 */
vec3 get_color(float t) {
    float rt = fract(t * u_paletteRepeat);
    
    if (u_paletteType == 0) return vec3(pow(rt, 0.3), pow(rt, 0.8), pow(rt, 2.5));           // FIRE
    if (u_paletteType == 1) return vec3(sin(rt * 10.0 + 0.5) * 0.5 + 0.5, cos(rt * 5.0) * 0.5 + 0.5, sin(rt * 15.0 + 1.0) * 0.5 + 0.5); // ULTRAVIOLET
    if (u_paletteType == 2) return vec3(pow(rt, 1.5) * 0.5, pow(rt, 0.7), 1.0);              // GLACIER
    if (u_paletteType == 3) return vec3(pow(rt, 0.8));                                         // CLASSIC (Graustufen)
    if (u_paletteType == 4) return vec3(pow(rt, 2.0) * 0.4, pow(rt, 0.4), 1.0);              // ELECTRIC
    if (u_paletteType == 5) return vec3(sin(rt * 4.0) * 0.5 + 0.5, 1.0 - pow(rt, 0.5), 1.0 - rt * 0.5); // NEON
    if (u_paletteType == 6) return vec3(1.0, pow(1.0 - rt, 0.6), pow(0.5 * rt, 1.2));        // SUNSET
    if (u_paletteType == 7) return vec3(pow(rt, 1.2) * 0.2, 0.5 + 0.5 * pow(rt, 0.4), pow(rt, 0.8) * 0.3); // FOREST
    if (u_paletteType == 8) return vec3(0.0, pow(rt, 0.5) * 0.8, 0.4 + 0.6 * pow(rt, 0.3)); // OCEAN
    if (u_paletteType == 9) return vec3(pow(rt, 0.4), 0.84 * pow(rt, 0.6), 0.2 * pow(rt, 1.5)); // GOLDEN
    if (u_paletteType == 10) return vec3(0.5 + 0.5 * sin(rt * 8.0), 0.3 + 0.3 * cos(rt * 15.0), 0.7 + 0.3 * sin(rt * 4.0)); // COSMIC
    
    // Hochkontrast-Paletten
    if (u_paletteType == 11) return vec3(step(0.5, fract(rt * 20.0))); // ZEBRA: harte Schwarz/Weiß-Bänder
    if (u_paletteType == 12) { // CYBERPUNK: Schwarz → Pink → Cyan
        if (rt < 0.2) return vec3(0.0);
        if (rt < 0.6) return vec3(1.0, 0.0, 1.0);
        return vec3(0.0, 1.0, 1.0);
    }
    if (u_paletteType == 13) return vec3(0.0, 1.0, 0.0) * step(0.1, rt) * pow(rt, 0.3); // TOXIC: Neon-Grün
    if (u_paletteType == 14) return vec3(step(0.1, rt), step(0.5, rt) * 0.6, step(0.8, rt) * 0.3); // MAGMA
    if (u_paletteType == 15) return vec3(1.0) * step(0.9, rt); // VOID: fast alles schwarz

    // Aufwändige Mehrfarb-Paletten mit linearer Interpolation
    if (u_paletteType == 16) { // SYNTHWAVE: Dunkelviolett → Karmesin → Neon-Pink
        vec3 c1 = vec3(0.14, 0.04, 0.21);
        vec3 c2 = vec3(0.76, 0.08, 0.20);
        vec3 c3 = vec3(0.93, 0.12, 0.47);
        if (rt < 0.5) return mix(c1, c2, rt * 2.0);
        return mix(c2, c3, (rt - 0.5) * 2.0);
    }
    if (u_paletteType == 17) { // PEACOCK: Schwarz → Teal → Grün → Creme
        vec3 c1 = vec3(0.0, 0.0, 0.0);
        vec3 c2 = vec3(0.0, 0.66, 0.59);
        vec3 c3 = vec3(0.01, 0.76, 0.60);
        vec3 c4 = vec3(0.94, 0.95, 0.74);
        if (rt < 0.33) return mix(c1, c2, rt * 3.0);
        if (rt < 0.66) return mix(c2, c3, (rt - 0.33) * 3.0);
        return mix(c3, c4, (rt - 0.66) * 3.0);
    }
    if (u_paletteType == 18) return vec3(pow(rt, 2.0) + 0.1, pow(rt, 6.0), pow(rt, 10.0)) * 1.5; // RUBY
    if (u_paletteType == 19) return vec3(pow(rt, 10.0), pow(rt, 2.0) + 0.1, pow(rt, 8.0)) * 1.5; // EMERALD
    if (u_paletteType == 20) { // OBSIDIAN: fast schwarz mit Cyan-Akzent an den Rändern
        if (rt < 0.9) return vec3(rt * 0.1);
        return mix(vec3(0.1), vec3(0.0, 0.8, 1.0), (rt - 0.9) * 10.0);
    }

    return vec3(rt); // Fallback: Graustufen
}

void main() {
    float aspectRatio = u_resolution.x / u_resolution.y;
    // UV-Koordinate: (0,0) = Bildmitte, ±0.5 = Rand
    vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);

    // Skalierung in DS-Arithmetik umrechnen (x-Achse mit Aspektverhältnis korrigieren)
    vec2 ds_aspect = ds_set(aspectRatio);
    vec2 ds_uv_x = ds_set(uv.x);
    vec2 ds_uv_y = ds_set(uv.y);
    vec2 ds_scale_y = u_scale;
    vec2 ds_scale_x = ds_mul(ds_scale_y, ds_aspect);

    // Komplexe Koordinate c = Zentrum + UV-Offset (alles in DS)
    vec2 offset_x = ds_mul(ds_uv_x, ds_scale_x);
    vec2 offset_y = ds_mul(ds_uv_y, ds_scale_y);
    vec2 c_re = ds_add(u_center_x, offset_x);
    vec2 c_im = ds_add(u_center_y, offset_y);

    // Mandelbrot-Iteration: z_(n+1) = z_n² + c, Start bei z = 0
    vec2 z_re = ds_set(0.0);
    vec2 z_im = ds_set(0.0);
    int iter = 0;
    float distSq = 0.0;
    for (int i = 0; i < 10000; i++) {
        if (i >= u_maxIterations) break;
        // z² = (re + im*i)² = re²-im² + 2*re*im*i
        vec2 r2 = ds_mul(z_re, z_re);
        vec2 i2 = ds_mul(z_im, z_im);
        vec2 ri = ds_mul(z_re, z_im);
        z_re = ds_add(ds_sub(r2, i2), c_re);
        z_im = ds_add(ds_add(ri, ri), c_im);
        // Escape-Radius 8 (|z|² > 64) für glatteres Coloring
        distSq = float(z_re.x * z_re.x + z_im.x * z_im.x);
        if (distSq > 64.0) break;
        iter++;
    }

    if (iter == u_maxIterations) {
        // Punkt liegt im Mandelbrot-Set → schwarz
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        // Smooth Coloring: Iterationszahl durch logarithmische Normierung glätten,
        // um harte Farbband-Übergänge zu vermeiden
        float log_zn = log(distSq) / 2.0;
        float nu = log(log_zn / log(2.0)) / log(2.0);
        float smooth_iter = float(iter) + 1.0 - nu;
        float t = log(smooth_iter) / log(float(u_maxIterations));
        t = clamp(t, 0.0, 1.0);
        vec3 color = get_color(t);
        outColor = vec4(clamp(color * 1.1, 0.0, 1.0), 1.0);
    }
}
`;

// Mapping: PaletteType-Enum → Integer-Index im Shader (u_paletteType)
const PALETTE_INDEX_MAP: Record<PaletteType, number> = {
  [PaletteType.FIRE]: 0,
  [PaletteType.ULTRAVIOLET]: 1,
  [PaletteType.GLACIER]: 2,
  [PaletteType.CLASSIC]: 3,
  [PaletteType.ELECTRIC]: 4,
  [PaletteType.NEON]: 5,
  [PaletteType.SUNSET]: 6,
  [PaletteType.FOREST]: 7,
  [PaletteType.OCEAN]: 8,
  [PaletteType.GOLDEN]: 9,
  [PaletteType.COSMIC]: 10,
  [PaletteType.ZEBRA]: 11,
  [PaletteType.CYBERPUNK]: 12,
  [PaletteType.TOXIC]: 13,
  [PaletteType.MAGMA]: 14,
  [PaletteType.VOID]: 15,
  [PaletteType.SYNTHWAVE]: 16,
  [PaletteType.PEACOCK]: 17,
  [PaletteType.RUBY]: 18,
  [PaletteType.EMERALD]: 19,
  [PaletteType.OBSIDIAN]: 20,
};

/**
 * Zerlegt eine float64-Zahl in (hi, lo) für die DS-Arithmetik im Shader.
 * Math.fround() erzeugt den auf float32 gerundeten Wert (hi),
 * lo ist der verbleibende Fehler.
 */
const split = (v: number): [number, number] => {
  const hi = Math.fround(v);
  const lo = v - hi;
  return [hi, lo];
};

/**
 * MandelbrotCanvas rendert das Fraktal in Echtzeit via WebGL2.
 * Unterstützt Zoom, Pan, Hover-Telemetrie und 8K-Hochauflösungs-Export.
 */
const MandelbrotCanvas = forwardRef<MandelbrotCanvasHandle, Props>(({ viewport, maxIterations, palette, paletteRepeat, onViewChange, onHover }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  // Panning-Zustand: true während Maus gedrückt gehalten wird
  const isPanning = useRef(false);
  // Startposition des Klicks (für Unterscheidung Pan vs. Zoom-Klick)
  const startMousePos = useRef({ x: 0, y: 0 });
  const lastMousePos = useRef({ x: 0, y: 0 });

  /** Kompiliert Vertex- und Fragment-Shader und linkt sie zu einem WebGL-Programm */
  const setupProgram = (gl: WebGL2RenderingContext) => {
    const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
      }
      return shader;
    };
    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    return program;
  };

  /** Initialisiert den WebGL2-Kontext und lädt das Vollbild-Quad in den GPU-Buffer */
  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // preserveDrawingBuffer: true ist nötig für den 8K-Export (toBlob nach dem Render)
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return;
    glRef.current = gl;
    programRef.current = setupProgram(gl);

    // Zwei Dreiecke als Vollbild-Quad: deckt den gesamten NDC-Raum [-1,1]² ab
    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posAttrib = gl.getAttribLocation(programRef.current, 'a_position');
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);
  }, []);

  /**
   * Setzt alle Shader-Uniforms und zeichnet das Fraktal auf den übergebenen GL-Kontext.
   * Wird sowohl für den Live-Canvas als auch für den Offscreen-8K-Canvas verwendet.
   */
  const drawToContext = (gl: WebGL2RenderingContext, program: WebGLProgram, view: Viewport, w: number, h: number) => {
    gl.useProgram(program);
    // Viewport-Zentrum und Skala als DS-Zahlen (hi, lo) übergeben
    const [cXh, cXl] = split(view.x);
    const [cYh, cYl] = split(view.y);
    const [sH, sL] = split(4.0 / view.zoom); // 4.0 = initialer Sichtbereich in komplexen Einheiten
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), w, h);
    gl.uniform2f(gl.getUniformLocation(program, 'u_center_x'), cXh, cXl);
    gl.uniform2f(gl.getUniformLocation(program, 'u_center_y'), cYh, cYl);
    gl.uniform2f(gl.getUniformLocation(program, 'u_scale'), sH, sL);
    gl.uniform1i(gl.getUniformLocation(program, 'u_maxIterations'), maxIterations);
    gl.uniform1i(gl.getUniformLocation(program, 'u_paletteType'), PALETTE_INDEX_MAP[palette]);
    gl.uniform1f(gl.getUniformLocation(program, 'u_paletteRepeat'), paletteRepeat);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6); // 6 Vertices = 2 Dreiecke = 1 Quad
  };

  /**
   * Exportiert den aktuellen Viewport in der gewünschten Auflösung.
   * Rendert auf einem unsichtbaren Offscreen-Canvas und gibt einen Blob zurück.
   * Bevorzugt HEIC (kleiner, verlustfrei auf Apple), fällt auf PNG zurück.
   */
  useImperativeHandle(ref, () => ({
    captureHighRes: async (width: number, height: number) => {
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const gl = offscreen.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error("Offscreen WebGL2 not supported");
      
      // Vollständige WebGL-Initialisierung für den Offscreen-Canvas
      const program = setupProgram(gl);
      const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const posAttrib = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posAttrib);
      gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

      drawToContext(gl, program, viewport, width, height);
      
      // HEIC bevorzugen (Apple-Format, kleiner als PNG bei gleicher Qualität)
      const targetMime = 'image/heic';
      const fallbackMime = 'image/png';

      const blob = await new Promise<Blob | null>(resolve => offscreen.toBlob(resolve, targetMime, 1.0));
      if (blob && (blob.type === targetMime || blob.type === 'image/heif')) return blob;

      // Fallback: PNG (universell unterstützt, verlustfrei)
      const pngBlob = await new Promise<Blob | null>(resolve => offscreen.toBlob(resolve, fallbackMime));
      if (!pngBlob) throw new Error("Failed to capture image");
      return pngBlob;
    }
  }), [viewport, maxIterations, palette, paletteRepeat]);

  // WebGL einmalig beim Mounten initialisieren
  useEffect(() => { initWebGL(); }, [initWebGL]);

  // Fraktal neu zeichnen wenn sich Viewport, Iterationen oder Palette ändern
  const draw = useCallback(() => {
    if (!glRef.current || !programRef.current || !canvasRef.current) return;
    drawToContext(glRef.current, programRef.current, viewport, canvasRef.current.width, canvasRef.current.height);
  }, [viewport, maxIterations, palette, paletteRepeat]);

  // Canvas-Größe bei Fenster-Resize anpassen und neu rendern
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
        draw();
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  /**
   * Rechnet eine Bildschirmkoordinate (Pixel) in eine komplexe Zahl um.
   * Berücksichtigt Aspektverhältnis, Zoom und Viewport-Zentrum.
   */
  const getComplexCoord = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { re: 0, im: 0 };
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const aspectRatio = canvas.width / canvas.height;
    const scaleY = 4 / viewport.zoom;
    const scaleX = scaleY * aspectRatio;
    const uvX = (mouseX / canvas.width) - 0.5;
    // Y-Achse invertieren: Canvas-Y wächst nach unten, Im-Achse nach oben
    const uvY = 0.5 - (mouseY / canvas.height);
    return { re: viewport.x + uvX * scaleX, im: viewport.y + uvY * scaleY };
  };

  /** Scroll-Zoom: Zoomt auf die Mausposition, nicht auf die Bildmitte */
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const { re, im } = getComplexCoord(e.clientX, e.clientY);
    // Zentrum so verschieben, dass der Punkt unter dem Mauszeiger fixiert bleibt
    onViewChange({
      x: viewport.x + (re - viewport.x) * (1 - 1 / zoomFactor),
      y: viewport.y + (im - viewport.y) * (1 - 1 / zoomFactor),
      zoom: viewport.zoom * zoomFactor
    });
  };

  /** Startet das Panning beim Drücken der linken Maustaste */
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isPanning.current = true;
      startMousePos.current = { x: e.clientX, y: e.clientY };
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  /** Aktualisiert Hover-Telemetrie und bewegt den Viewport beim Panning */
  const handleMouseMove = (e: React.MouseEvent) => {
    const { re, im } = getComplexCoord(e.clientX, e.clientY);

    // Hover-Telemetrie: Iterationen für den Punkt unter dem Cursor berechnen (CPU-seitig)
    if (onHover) {
      let zx = 0, zy = 0, iter = 0;
      while (zx * zx + zy * zy < 64 && iter < maxIterations) {
        const xtemp = zx * zx - zy * zy + re;
        zy = 2 * zx * zy + im;
        zx = xtemp;
        iter++;
      }
      onHover({ re, im, iterations: iter });
    }

    if (!isPanning.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const aspectRatio = canvas.width / canvas.height;
    const scaleY = 4 / viewport.zoom;
    const scaleX = scaleY * aspectRatio;
    // Viewport in die entgegengesetzte Richtung der Mausbewegung verschieben
    onViewChange({
      ...viewport,
      x: viewport.x - (dx / canvas.width) * scaleX,
      y: viewport.y + (dy / canvas.height) * scaleY
    });
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => { isPanning.current = false; };
  const handleMouseLeave = () => { isPanning.current = false; if (onHover) onHover(null); };

  /**
   * Klick-Zoom: Unterscheidet zwischen Pan (>5px Bewegung) und Zoom-Klick.
   * Linksklick = 2x Zoom-In; Shift+Klick = 2x Zoom-Out auf den Klickpunkt.
   */
  const handleClick = (e: React.MouseEvent) => {
    const totalDistX = Math.abs(e.clientX - startMousePos.current.x);
    const totalDistY = Math.abs(e.clientY - startMousePos.current.y);
    if (totalDistX > 5 || totalDistY > 5) return; // Zu viel Bewegung → war ein Pan, kein Klick
    if (e.button === 0) {
      const { re, im } = getComplexCoord(e.clientX, e.clientY);
      onViewChange({ x: re, y: im, zoom: viewport.zoom * (e.shiftKey ? 0.5 : 2) });
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    />
  );
});

export default MandelbrotCanvas;
