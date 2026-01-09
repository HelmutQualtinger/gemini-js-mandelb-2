
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface FractalParams {
  maxIterations: number;
  palette: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Discovery {
  name: string;
  x: number;
  y: number;
  zoom: number;
  description: string;
}

export enum PaletteType {
  FIRE = 'fire',
  ULTRAVIOLET = 'ultraviolet',
  GLACIER = 'glacier',
  CLASSIC = 'classic',
  ELECTRIC = 'electric',
  NEON = 'neon',
  SUNSET = 'sunset',
  FOREST = 'forest',
  OCEAN = 'ocean',
  GOLDEN = 'golden',
  COSMIC = 'cosmic'
}
