// Typdefinitionen für die Mandelbrot-Fraktal-App

/** Beschreibt den aktuellen Ausschnitt (Viewport) der komplexen Zahlenebene */
export interface Viewport {
  x: number; // Realteil des Mittelpunkts
  y: number; // Imaginärteil des Mittelpunkts
  zoom: number; // Zoom-Faktor (1 = Standard, höher = stärker vergrößert)
}

/** Rendering-Parameter für den Fraktal-Canvas */
export interface FractalParams {
  maxIterations: number;  // Maximale Iterationstiefe (mehr = mehr Detail, aber langsamer)
  palette: string;        // Farbpaletten-Name
  paletteRepeat: number;  // Wie oft die Palette wiederholt wird
}

/** Eine Chatnachricht im KI-Assistenten-Panel */
export interface ChatMessage {
  role: 'user' | 'assistant'; // Absender: Nutzer oder KI
  content: string;            // Nachrichtentext (Markdown unterstützt)
}

/** Ein von Gemini gefundener Punkt im Mandelbrot-Set */
export interface Discovery {
  name: string;       // Bezeichnung (z.B. "Seahorse Valley")
  x: number;         // Realteil der Koordinate
  y: number;         // Imaginärteil der Koordinate
  zoom: number;      // Empfohlener Zoom-Level
  description: string; // Kurzbeschreibung des Ortes
}

/** Alle verfügbaren Farbpaletten für die Fraktal-Darstellung */
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
  COSMIC = 'cosmic',
  ZEBRA = 'zebra',
  CYBERPUNK = 'cyberpunk',
  TOXIC = 'toxic',
  MAGMA = 'magma',
  VOID = 'void',
  SYNTHWAVE = 'synthwave',
  PEACOCK = 'peacock',
  RUBY = 'ruby',
  EMERALD = 'emerald',
  OBSIDIAN = 'obsidian'
}
