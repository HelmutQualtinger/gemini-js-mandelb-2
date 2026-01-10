
import React, { useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Viewport, PaletteType } from '../types';

interface HoverInfo {
  re: number;
  im: number;
  iterations: number;
}

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

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0, 1);
}
`;

const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_center_x; 
uniform vec2 u_center_y; 
uniform vec2 u_scale;    
uniform int u_maxIterations;
uniform int u_paletteType;
uniform float u_paletteRepeat;

out vec4 outColor;

vec2 ds_set(float a) { return vec2(a, 0.0); }

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

vec2 ds_mul(vec2 d1, vec2 d2) {
    float c11 = d1.x * d2.x;
    float c21 = d1.x * d2.y + d1.y * d2.x;
    float s1 = c11 + c21;
    float e1 = c21 - (s1 - c11);
    return vec2(s1, e1);
}

vec3 get_color(float t) {
    float rt = fract(t * u_paletteRepeat);
    
    if (u_paletteType == 0) return vec3(pow(rt, 0.3), pow(rt, 0.8), pow(rt, 2.5));
    if (u_paletteType == 1) return vec3(sin(rt * 10.0 + 0.5) * 0.5 + 0.5, cos(rt * 5.0) * 0.5 + 0.5, sin(rt * 15.0 + 1.0) * 0.5 + 0.5);
    if (u_paletteType == 2) return vec3(pow(rt, 1.5) * 0.5, pow(rt, 0.7), 1.0);
    if (u_paletteType == 3) return vec3(pow(rt, 0.8));
    if (u_paletteType == 4) return vec3(pow(rt, 2.0) * 0.4, pow(rt, 0.4), 1.0);
    if (u_paletteType == 5) return vec3(sin(rt * 4.0) * 0.5 + 0.5, 1.0 - pow(rt, 0.5), 1.0 - rt * 0.5);
    if (u_paletteType == 6) return vec3(1.0, pow(1.0 - rt, 0.6), pow(0.5 * rt, 1.2));
    if (u_paletteType == 7) return vec3(pow(rt, 1.2) * 0.2, 0.5 + 0.5 * pow(rt, 0.4), pow(rt, 0.8) * 0.3);
    if (u_paletteType == 8) return vec3(0.0, pow(rt, 0.5) * 0.8, 0.4 + 0.6 * pow(rt, 0.3));
    if (u_paletteType == 9) return vec3(pow(rt, 0.4), 0.84 * pow(rt, 0.6), 0.2 * pow(rt, 1.5));
    if (u_paletteType == 10) return vec3(0.5 + 0.5 * sin(rt * 8.0), 0.3 + 0.3 * cos(rt * 15.0), 0.7 + 0.3 * sin(rt * 4.0));
    
    // High Contrast Palettes
    if (u_paletteType == 11) return vec3(step(0.5, fract(rt * 20.0))); // ZEBRA
    if (u_paletteType == 12) { // CYBERPUNK
        if (rt < 0.2) return vec3(0.0);
        if (rt < 0.6) return vec3(1.0, 0.0, 1.0); // Pink
        return vec3(0.0, 1.0, 1.0); // Cyan
    }
    if (u_paletteType == 13) return vec3(0.0, 1.0, 0.0) * step(0.1, rt) * pow(rt, 0.3); // TOXIC
    if (u_paletteType == 14) return vec3(step(0.1, rt), step(0.5, rt) * 0.6, step(0.8, rt) * 0.3); // MAGMA
    if (u_paletteType == 15) return vec3(1.0) * step(0.9, rt); // VOID

    // Fancy Palettes
    if (u_paletteType == 16) { // SYNTHWAVE
        vec3 c1 = vec3(0.14, 0.04, 0.21); // Dark Purple
        vec3 c2 = vec3(0.76, 0.08, 0.20); // Crimson
        vec3 c3 = vec3(0.93, 0.12, 0.47); // Neon Pink
        if (rt < 0.5) return mix(c1, c2, rt * 2.0);
        return mix(c2, c3, (rt - 0.5) * 2.0);
    }
    if (u_paletteType == 17) { // PEACOCK
        vec3 c1 = vec3(0.0, 0.0, 0.0);
        vec3 c2 = vec3(0.0, 0.66, 0.59); // Teal
        vec3 c3 = vec3(0.01, 0.76, 0.60); // Green
        vec3 c4 = vec3(0.94, 0.95, 0.74); // Cream
        if (rt < 0.33) return mix(c1, c2, rt * 3.0);
        if (rt < 0.66) return mix(c2, c3, (rt - 0.33) * 3.0);
        return mix(c3, c4, (rt - 0.66) * 3.0);
    }
    if (u_paletteType == 18) return vec3(pow(rt, 2.0) + 0.1, pow(rt, 6.0), pow(rt, 10.0)) * 1.5; // RUBY
    if (u_paletteType == 19) return vec3(pow(rt, 10.0), pow(rt, 2.0) + 0.1, pow(rt, 8.0)) * 1.5; // EMERALD
    if (u_paletteType == 20) { // OBSIDIAN
        if (rt < 0.9) return vec3(rt * 0.1);
        return mix(vec3(0.1), vec3(0.0, 0.8, 1.0), (rt - 0.9) * 10.0);
    }

    return vec3(rt);
}

void main() {
    float aspectRatio = u_resolution.x / u_resolution.y;
    vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
    vec2 ds_aspect = ds_set(aspectRatio);
    vec2 ds_uv_x = ds_set(uv.x);
    vec2 ds_uv_y = ds_set(uv.y);
    vec2 ds_scale_y = u_scale;
    vec2 ds_scale_x = ds_mul(ds_scale_y, ds_aspect);
    vec2 offset_x = ds_mul(ds_uv_x, ds_scale_x);
    vec2 offset_y = ds_mul(ds_uv_y, ds_scale_y);
    vec2 c_re = ds_add(u_center_x, offset_x);
    vec2 c_im = ds_add(u_center_y, offset_y);
    vec2 z_re = ds_set(0.0);
    vec2 z_im = ds_set(0.0);
    int iter = 0;
    float distSq = 0.0;
    for (int i = 0; i < 10000; i++) {
        if (i >= u_maxIterations) break;
        vec2 r2 = ds_mul(z_re, z_re);
        vec2 i2 = ds_mul(z_im, z_im);
        vec2 ri = ds_mul(z_re, z_im);
        z_re = ds_add(ds_sub(r2, i2), c_re);
        z_im = ds_add(ds_add(ri, ri), c_im);
        distSq = float(z_re.x * z_re.x + z_im.x * z_im.x);
        if (distSq > 64.0) break;
        iter++;
    }
    if (iter == u_maxIterations) {
        outColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
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

const split = (v: number): [number, number] => {
  const hi = Math.fround(v);
  const lo = v - hi;
  return [hi, lo];
};

const MandelbrotCanvas = forwardRef<MandelbrotCanvasHandle, Props>(({ viewport, maxIterations, palette, paletteRepeat, onViewChange, onHover }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const isPanning = useRef(false);
  const startMousePos = useRef({ x: 0, y: 0 });
  const lastMousePos = useRef({ x: 0, y: 0 });

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

  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) return;
    glRef.current = gl;
    programRef.current = setupProgram(gl);

    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const posAttrib = gl.getAttribLocation(programRef.current, 'a_position');
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);
  }, []);

  const drawToContext = (gl: WebGL2RenderingContext, program: WebGLProgram, view: Viewport, w: number, h: number) => {
    gl.useProgram(program);
    const [cXh, cXl] = split(view.x);
    const [cYh, cYl] = split(view.y);
    const [sH, sL] = split(4.0 / view.zoom);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), w, h);
    gl.uniform2f(gl.getUniformLocation(program, 'u_center_x'), cXh, cXl);
    gl.uniform2f(gl.getUniformLocation(program, 'u_center_y'), cYh, cYl);
    gl.uniform2f(gl.getUniformLocation(program, 'u_scale'), sH, sL);
    gl.uniform1i(gl.getUniformLocation(program, 'u_maxIterations'), maxIterations);
    gl.uniform1i(gl.getUniformLocation(program, 'u_paletteType'), PALETTE_INDEX_MAP[palette]);
    gl.uniform1f(gl.getUniformLocation(program, 'u_paletteRepeat'), paletteRepeat);
    gl.viewport(0, 0, w, h);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  useImperativeHandle(ref, () => ({
    captureHighRes: async (width: number, height: number) => {
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const gl = offscreen.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error("Offscreen WebGL2 not supported");
      
      const program = setupProgram(gl);
      const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const posAttrib = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(posAttrib);
      gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

      drawToContext(gl, program, viewport, width, height);
      
      const targetMime = 'image/heic';
      const fallbackMime = 'image/png';

      const blob = await new Promise<Blob | null>(resolve => offscreen.toBlob(resolve, targetMime, 1.0));
      if (blob && (blob.type === targetMime || blob.type === 'image/heif')) return blob;

      const pngBlob = await new Promise<Blob | null>(resolve => offscreen.toBlob(resolve, fallbackMime));
      if (!pngBlob) throw new Error("Failed to capture image");
      return pngBlob;
    }
  }), [viewport, maxIterations, palette, paletteRepeat]);

  useEffect(() => { initWebGL(); }, [initWebGL]);

  const draw = useCallback(() => {
    if (!glRef.current || !programRef.current || !canvasRef.current) return;
    drawToContext(glRef.current, programRef.current, viewport, canvasRef.current.width, canvasRef.current.height);
  }, [viewport, maxIterations, palette, paletteRepeat]);

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
    const uvY = 0.5 - (mouseY / canvas.height);
    return { re: viewport.x + uvX * scaleX, im: viewport.y + uvY * scaleY };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const { re, im } = getComplexCoord(e.clientX, e.clientY);
    onViewChange({
      x: viewport.x + (re - viewport.x) * (1 - 1 / zoomFactor),
      y: viewport.y + (im - viewport.y) * (1 - 1 / zoomFactor),
      zoom: viewport.zoom * zoomFactor
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isPanning.current = true;
      startMousePos.current = { x: e.clientX, y: e.clientY };
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { re, im } = getComplexCoord(e.clientX, e.clientY);
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
    onViewChange({
      ...viewport,
      x: viewport.x - (dx / canvas.width) * scaleX,
      y: viewport.y + (dy / canvas.height) * scaleY
    });
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => { isPanning.current = false; };
  const handleMouseLeave = () => { isPanning.current = false; if (onHover) onHover(null); };

  const handleClick = (e: React.MouseEvent) => {
    const totalDistX = Math.abs(e.clientX - startMousePos.current.x);
    const totalDistY = Math.abs(e.clientY - startMousePos.current.y);
    if (totalDistX > 5 || totalDistY > 5) return;
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
