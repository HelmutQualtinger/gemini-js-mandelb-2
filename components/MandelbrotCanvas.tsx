
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
uniform vec2 u_center;
uniform float u_zoom;
uniform int u_maxIterations;
uniform int u_paletteType;

out vec4 outColor;

vec3 get_color(float t) {
    if (u_paletteType == 0) { // FIRE
        return vec3(pow(t, 0.5), pow(t, 2.0), pow(t, 5.0));
    } else if (u_paletteType == 1) { // ULTRAVIOLET
        return vec3(sin(t * 10.0) * 0.5 + 0.5, cos(t * 5.0) * 0.5 + 0.5, sin(t * 15.0) * 0.5 + 0.5);
    } else if (u_paletteType == 2) { // GLACIER
        return vec3(t * 0.4, t * 0.8, 1.0);
    } else if (u_paletteType == 3) { // CLASSIC
        return vec3(t);
    } else if (u_paletteType == 4) { // ELECTRIC
        return vec3(sin(t * 50.0) * 0.5 + 0.5, sin(t * 20.0) * 0.5 + 0.5, 1.0);
    } else if (u_paletteType == 5) { // NEON
        return vec3(sin(t * 3.14159), cos(t * 1.5707), 1.0 - t);
    } else if (u_paletteType == 6) { // SUNSET
        return vec3(1.0, 1.0 - t, 0.5 * t);
    } else if (u_paletteType == 7) { // FOREST
        return vec3(0.1 * t, 0.4 + 0.6 * sqrt(t), 0.2 * t);
    } else if (u_paletteType == 8) { // OCEAN
        return vec3(0.0, 0.6 * t, 0.6 + 0.4 * t);
    } else if (u_paletteType == 9) { // GOLDEN
        return vec3(t, 0.84 * t, 0.2 * t);
    } else { // COSMIC
        return vec3(0.5 + 0.5 * sin(t * 6.0), 0.2 + 0.2 * cos(t * 12.0), 0.6 + 0.4 * sin(t * 3.0));
    }
}

void main() {
    float aspectRatio = u_resolution.x / u_resolution.y;
    vec2 uv = (gl_FragCoord.xy / u_resolution - 0.5);
    
    float scaleY = 4.0 / u_zoom;
    float scaleX = scaleY * aspectRatio;
    
    vec2 c = u_center + uv * vec2(scaleX, scaleY);
    
    vec2 z = vec2(0.0);
    int iter = 0;
    float distSq = 0.0;
    
    for (int i = 0; i < 5000; i++) {
        if (i >= u_maxIterations) break;
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        distSq = dot(z, z);
        if (distSq > 1024.0) break;
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
        outColor = vec4(get_color(t), 1.0);
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
};

const MandelbrotCanvas = forwardRef<MandelbrotCanvasHandle, Props>(({ viewport, maxIterations, palette, onViewChange, onHover }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const clickTimer = useRef<number | null>(null);

  const setupWebGL = (gl: WebGL2RenderingContext) => {
    const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vs || !fs) return null;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return null;
    }

    const positions = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    const posAttrib = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

    return program;
  };

  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
    if (!gl) {
      alert('WebGL 2 not supported');
      return;
    }
    glRef.current = gl;
    programRef.current = setupWebGL(gl);
  }, []);

  const renderToContext = (gl: WebGL2RenderingContext, program: WebGLProgram, width: number, height: number, view: Viewport, iters: number, pal: PaletteType) => {
    gl.useProgram(program);
    const uRes = gl.getUniformLocation(program, 'u_resolution');
    const uCenter = gl.getUniformLocation(program, 'u_center');
    const uZoom = gl.getUniformLocation(program, 'u_zoom');
    const uMaxIter = gl.getUniformLocation(program, 'u_maxIterations');
    const uPalette = gl.getUniformLocation(program, 'u_paletteType');

    gl.uniform2f(uRes, width, height);
    gl.uniform2f(uCenter, view.x, view.y);
    gl.uniform1f(uZoom, view.zoom);
    gl.uniform1i(uMaxIter, iters);
    gl.uniform1i(uPalette, PALETTE_INDEX_MAP[pal]);

    gl.viewport(0, 0, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const draw = useCallback(() => {
    const gl = glRef.current;
    const program = programRef.current;
    if (!gl || !program || !canvasRef.current) return;
    renderToContext(gl, program, canvasRef.current.width, canvasRef.current.height, viewport, maxIterations, palette);
  }, [viewport, maxIterations, palette]);

  useImperativeHandle(ref, () => ({
    captureHighRes: async (width: number, height: number) => {
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const gl = offscreen.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
      if (!gl) throw new Error('Could not create offscreen WebGL context');

      const program = setupWebGL(gl);
      if (!program) throw new Error('Could not setup offscreen shader');

      renderToContext(gl, program, width, height, viewport, maxIterations, palette);

      return new Promise<Blob>((resolve, reject) => {
        offscreen.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to capture high-res image'));
        }, 'image/png');
      });
    }
  }));

  useEffect(() => {
    initWebGL();
  }, [initWebGL]);

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

  useEffect(() => {
    draw();
  }, [draw]);

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

  const getEscapeInfoJS = (cx: number, cy: number, maxIter: number) => {
    let zx = 0; let zy = 0; let iter = 0;
    while (zx * zx + zy * zy < 1024 && iter < maxIter) {
      const xtemp = zx * zx - zy * zy + cx;
      zy = 2 * zx * zy + cy;
      zx = xtemp;
      iter++;
    }
    return iter;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const aspectRatio = rect.width / rect.height;
    const scaleY = 4 / viewport.zoom;
    const scaleX = scaleY * aspectRatio;
    const uvX = (mouseX / rect.width) - 0.5;
    const uvY = 0.5 - (mouseY / rect.height);
    const relX = uvX * scaleX;
    const relY = uvY * scaleY;
    onViewChange({
      x: viewport.x + relX * (1 - 1 / zoomFactor),
      y: viewport.y + relY * (1 - 1 / zoomFactor),
      zoom: viewport.zoom * zoomFactor
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    isPanning.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const { re, im } = getComplexCoord(e.clientX, e.clientY);
    if (onHover) {
      const iter = getEscapeInfoJS(re, im, maxIterations);
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
    const moveX = (dx / canvas.width) * scaleX;
    const moveY = (dy / canvas.height) * scaleY;
    onViewChange({
      ...viewport,
      x: viewport.x - moveX,
      y: viewport.y + moveY
    });
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => { isPanning.current = false; };

  const handleClick = (e: React.MouseEvent) => {
    const dx = Math.abs(e.clientX - lastMousePos.current.x);
    const dy = Math.abs(e.clientY - lastMousePos.current.y);
    if (dx > 5 || dy > 5) return;
    const { re, im } = getComplexCoord(e.clientX, e.clientY);
    if (clickTimer.current) {
      window.clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onViewChange({ x: re, y: im, zoom: viewport.zoom / 2 });
    } else {
      clickTimer.current = window.setTimeout(() => {
        onViewChange({ x: re, y: im, zoom: viewport.zoom * 2 });
        clickTimer.current = null;
      }, 250);
    }
  };

  const handleMouseLeave = () => { isPanning.current = false; if (onHover) onHover(null); };

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full cursor-crosshair"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      onMouseLeave={handleMouseLeave}
    />
  );
});

export default MandelbrotCanvas;
