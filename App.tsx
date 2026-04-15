import React, { useState, useCallback, useRef, useEffect } from 'react';
import MandelbrotCanvas, { MandelbrotCanvasHandle } from './components/MandelbrotCanvas';
import { Viewport, PaletteType, Discovery, ChatMessage } from './types';
import { getDiscoveryInfo } from './services/geminiService';

// CSS-Gradients für die Vorschau-Swatches im Palette-Dropdown
const PALETTE_GRADIENTS: Record<PaletteType, string> = {
  [PaletteType.FIRE]: 'linear-gradient(to right, #000, #ff4d00, #ffcc00, #fff)',
  [PaletteType.ULTRAVIOLET]: 'linear-gradient(to right, #6d28d9, #f472b6, #38bdf8)',
  [PaletteType.GLACIER]: 'linear-gradient(to right, #003366, #3399ff, #ccf2ff, #ffffff)',
  [PaletteType.CLASSIC]: 'linear-gradient(to right, #000, #aaa, #fff)',
  [PaletteType.ELECTRIC]: 'linear-gradient(to right, #0000ff, #00ffff, #ffffff)',
  [PaletteType.NEON]: 'linear-gradient(to right, #ff00ff, #00ffff, #ffffff)',
  [PaletteType.SUNSET]: 'linear-gradient(to right, #ff0000, #ff8c00, #ffd700)',
  [PaletteType.FOREST]: 'linear-gradient(to right, #003300, #00cc00, #ccffcc)',
  [PaletteType.OCEAN]: 'linear-gradient(to right, #000066, #0066cc, #99ffff)',
  [PaletteType.GOLDEN]: 'linear-gradient(to right, #443300, #ffcc00, #ffff99)',
  [PaletteType.COSMIC]: 'linear-gradient(to right, #330066, #cc00ff, #ff99ff)',
  [PaletteType.ZEBRA]: 'repeating-linear-gradient(to right, #000, #000 5px, #fff 5px, #fff 10px)',
  [PaletteType.CYBERPUNK]: 'linear-gradient(to right, #000, #ff00ff, #00ffff)',
  [PaletteType.TOXIC]: 'linear-gradient(to right, #000, #00ff00)',
  [PaletteType.MAGMA]: 'linear-gradient(to right, #000, #800000, #ff4500, #ffff00)',
  [PaletteType.VOID]: 'linear-gradient(to right, #000010, #ffffff)',
  [PaletteType.SYNTHWAVE]: 'linear-gradient(to right, #240b36, #c31432, #ed1e79, #240b36)',
  [PaletteType.PEACOCK]: 'linear-gradient(to right, #000, #00a896, #02c39a, #f0f3bd)',
  [PaletteType.RUBY]: 'linear-gradient(to right, #300, #900, #f00, #fff)',
  [PaletteType.EMERALD]: 'linear-gradient(to right, #020, #050, #0a0, #ff0)',
  [PaletteType.OBSIDIAN]: 'linear-gradient(to right, #000, #111, #333, #0cf)'
};

const App: React.FC = () => {
  // Aktueller Ausschnitt der komplexen Zahlenebene
  const [viewport, setViewport] = useState<Viewport>({ x: -0.5, y: 0, zoom: 1 });
  // Maximale Iterationstiefe: mehr = feineres Detail, aber langsameres Rendering
  const [maxIterations, setMaxIterations] = useState(250);
  // Aktive Farbpalette
  const [palette, setPalette] = useState<PaletteType>(PaletteType.FIRE);
  // Wie oft die Palette über den Iterationsraum wiederholt wird
  const [paletteRepeat, setPaletteRepeat] = useState(1);
  // Eingabefeld für die Gemini-Suche
  const [chatInput, setChatInput] = useState('');
  // Ladezustand während Gemini-Anfrage
  const [isLoading, setIsLoading] = useState(false);
  // Ladezustand während 8K-Capture (Render dauert länger)
  const [isCapturing, setIsCapturing] = useState(false);
  // Liste der Chat-Nachrichten (Nutzer + Assistent)
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Koordinaten und Iterationszahl unter dem Mauszeiger
  const [hoverInfo, setHoverInfo] = useState<{ re: number; im: number; iterations: number } | null>(null);
  // Steuerung des Palette-Dropdowns
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  // Mobile: Controls-Panel ein-/ausblenden
  const [isControlsVisible, setIsControlsVisible] = useState(false);
  
  const paletteRef = useRef<HTMLDivElement>(null);
  // Ref auf den Canvas für den 8K-Export
  const canvasHandleRef = useRef<MandelbrotCanvasHandle>(null);

  // Palette-Dropdown schließen, wenn außerhalb geklickt wird
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        setIsPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Viewport-Update vom Canvas entgegennehmen (Zoom/Pan)
  const handleViewChange = useCallback((newView: Viewport) => {
    setViewport(newView);
  }, []);

  // Verhindert, dass Klicks auf UI-Elemente den Canvas-Zoom auslösen
  const stopEvent = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Zoom halbieren (Zoom-Out-Button)
  const handleZoomOut = (e: React.MouseEvent) => {
    stopEvent(e);
    setViewport(prev => ({ ...prev, zoom: prev.zoom * 0.5 }));
  };

  /** Rendert den aktuellen Viewport in 8K-Auflösung und lädt das Bild herunter.
   *  Bevorzugt Apple HEIC, fällt auf PNG zurück wenn der Browser kein HEIC unterstützt. */
  const handleCapture8K = async (e: React.MouseEvent) => {
    stopEvent(e);
    if (!canvasHandleRef.current) return;
    setIsCapturing(true);
    try {
      const blob = await canvasHandleRef.current.captureHighRes(7680, 4320);
      const isHeic = blob.type.includes('heic') || blob.type.includes('heif');
      const extension = isHeic ? 'heic' : 'png';
      
      // Download über temporären Anchor-Link auslösen
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fractal_8k_${Date.now()}.${extension}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: isHeic 
          ? "8K Ultra-HD Capture complete. Image saved in Apple HEIC format."
          : "8K Ultra-HD Capture complete. Note: Your browser doesn't support HEIC encoding, so I've saved a lossless PNG instead."
      }]);
    } catch (error) {
      console.error("Capture failed", error);
    } finally {
      setIsCapturing(false);
    }
  };

  /** Schickt die Nutzeranfrage an Gemini und springt zum gefundenen Mandelbrot-Punkt. */
  const handleDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setIsLoading(true);
    const userMsg = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);

    // Gemini gibt Koordinaten + Beschreibung zurück
    const discovery = await getDiscoveryInfo(userMsg, viewport);
    
    if (discovery) {
      // Viewport direkt auf die entdeckte Koordinate setzen
      setViewport({ x: discovery.x, y: discovery.y, zoom: discovery.zoom });
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: `Heading to **${discovery.name}**. ${discovery.description}` 
      }]);
    } else {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: "I couldn't find a specific coordinate for that, but feel free to explore manually!" 
      }]);
    }
    setIsLoading(false);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black text-white selection:bg-purple-500/30">
      {/* Mandelbrot-Canvas nimmt den gesamten Bildschirm ein */}
      <MandelbrotCanvas 
        ref={canvasHandleRef}
        viewport={viewport} 
        maxIterations={maxIterations} 
        palette={palette}
        paletteRepeat={paletteRepeat}
        onViewChange={handleViewChange}
        onHover={setHoverInfo}
      />

      {/* Vollbild-Overlay während 8K-Rendering */}
      {isCapturing && (
        <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-500">
          <div className="w-16 h-16 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
          <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">Processing 8K Ultra-HD</h2>
          <p className="text-sm text-white/40 font-mono mt-2 animate-pulse">Rendering 33 Million Double-Precision Iterations...</p>
        </div>
      )}

      {/* Mobile: Button zum Einblenden des Controls-Panels */}
      {!isControlsVisible && (
        <button
          onClick={() => setIsControlsVisible(true)}
          className="lg:hidden absolute top-6 left-6 z-20 bg-black/60 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-2xl flex items-center gap-3 active:scale-95 transition-all"
        >
          <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span className="text-xs font-black uppercase tracking-widest text-white/80">Telemetry</span>
        </button>
      )}

      {/* Linkes Steuerungspanel (Desktop: fixiert, Mobile: einfahrbar) */}
      <div className={`absolute top-0 lg:top-6 left-0 lg:left-6 z-30 h-full lg:h-auto w-full lg:w-80 space-y-4 pointer-events-none transition-transform duration-300 ${isControlsVisible ? 'translate-x-0' : 'max-lg:-translate-x-full'}`}>
        <div 
          className="pointer-events-auto bg-black/90 lg:bg-black/70 backdrop-blur-2xl lg:backdrop-blur-xl border-r lg:border border-white/10 p-5 lg:rounded-2xl shadow-2xl h-full lg:h-auto w-full lg:w-80 overflow-y-auto lg:overflow-visible no-scrollbar" 
          onMouseDown={stopEvent}
          onMouseUp={stopEvent}
          onClick={stopEvent}
        >
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-black bg-gradient-to-br from-blue-300 via-purple-400 to-pink-500 bg-clip-text text-transparent italic tracking-tighter">
                Fractal Mind
              </h1>
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Vivid Explorer</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleZoomOut}
                className="bg-white/5 hover:bg-white/10 border border-white/10 p-2 rounded-lg transition-colors group"
                title="Zoom Out"
              >
                <svg className="w-4 h-4 text-white/60 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                </svg>
              </button>
              <button 
                onClick={() => setIsControlsVisible(false)}
                className="lg:hidden bg-white/5 hover:bg-red-500/20 border border-white/10 p-2 rounded-lg transition-colors group"
              >
                <svg className="w-4 h-4 text-white/60 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          <div className="space-y-5">
            {/* Iterations-Slider: bestimmt die Detailtiefe des Fraktals */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Detail Density</label>
                <span className="text-[10px] font-mono text-purple-400">{maxIterations}</span>
              </div>
              <input 
                type="range" 
                min="100" 
                max="10000" 
                step="100"
                value={maxIterations} 
                onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                onMouseDown={stopEvent}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* Palette-Dropdown mit Farbvorschau */}
            <div className="relative" ref={paletteRef}>
              <label className="text-[10px] uppercase text-white/40 block mb-2 font-bold tracking-widest">Aesthetic Scheme</label>
              <button
                onClick={(e) => { e.stopPropagation(); setIsPaletteOpen(!isPaletteOpen); }}
                onMouseDown={stopEvent}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-sm focus:outline-none hover:bg-white/10 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-4 rounded-md border border-white/20 shadow-inner" style={{ background: PALETTE_GRADIENTS[palette] }}></div>
                  <span className="font-medium text-white/90">{palette.charAt(0).toUpperCase() + palette.slice(1)}</span>
                </div>
                <svg className={`w-4 h-4 text-white/40 transition-transform ${isPaletteOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Scrollbare Paletten-Liste */}
              {isPaletteOpen && (
                <div className="absolute top-full mt-2 w-full bg-zinc-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-y-auto max-h-[30vh] lg:max-h-[40vh] no-scrollbar backdrop-blur-2xl">
                  {Object.values(PaletteType).map((p) => (
                    <button
                      key={p}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPalette(p);
                        setIsPaletteOpen(false);
                      }}
                      onMouseDown={stopEvent}
                      className={`w-full flex items-center gap-4 px-4 py-3 text-xs hover:bg-white/10 transition-colors ${palette === p ? 'bg-purple-500/20 text-purple-300' : 'text-white/60'}`}
                    >
                      <div className="w-12 h-3.5 rounded-sm border border-white/10" style={{ background: PALETTE_GRADIENTS[p] }}></div>
                      <span className="font-bold">{p.charAt(0).toUpperCase() + p.slice(1)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Palette Cycles Slider: steuert wie oft die Palette über den Farbverlauf wiederholt wird */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <label className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Palette Cycles</label>
                <span className="text-[10px] font-mono text-pink-400">{paletteRepeat.toFixed(1)}x</span>
              </div>
              <input 
                type="range" 
                min="0.1" 
                max="20" 
                step="0.1"
                value={paletteRepeat} 
                onChange={(e) => setPaletteRepeat(parseFloat(e.target.value))}
                onMouseDown={stopEvent}
                className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
              />
            </div>

            {/* Anzeige des aktuellen Viewports (Zoom, Realteil, Imaginärteil) */}
            <div className="pt-4 border-t border-white/10">
              <div className="text-[10px] uppercase text-white/40 mb-3 font-bold tracking-widest">Scale & Navigation</div>
              <div className="space-y-1.5">
                <div className="flex justify-between items-center bg-blue-500/10 p-2.5 rounded-xl border border-blue-500/20 shadow-inner">
                  <span className="text-[9px] text-blue-300/60 uppercase font-black tracking-tighter">Zoom</span>
                  <span className="text-[10px] font-mono text-white tracking-widest">{viewport.zoom.toExponential(4)}</span>
                </div>
                <div className="flex justify-between items-center bg-blue-500/5 p-2 rounded-lg border border-white/5">
                  <span className="text-[9px] text-white/30 uppercase font-bold">Center Re</span>
                  <span className="text-[10px] font-mono text-white/80">{viewport.x.toExponential(6)}</span>
                </div>
                <div className="flex justify-between items-center bg-blue-500/5 p-2 rounded-lg border border-white/5">
                  <span className="text-[9px] text-white/30 uppercase font-bold">Center Im</span>
                  <span className="text-[10px] font-mono text-white/80">{viewport.y.toExponential(6)}</span>
                </div>
              </div>
            </div>

            {/* Cursor-Telemetrie: zeigt komplexe Koordinate und Iterations-Count unter dem Mauszeiger */}
            {hoverInfo && (
              <div className="pt-4 border-t border-white/10 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="text-[10px] uppercase text-white/40 mb-2 font-bold tracking-widest">Cursor Telemetry</div>
                <div className="space-y-1 font-mono text-[9px]">
                  <div className="flex justify-between bg-white/5 p-1.5 rounded">
                    <span className="text-white/30">Re:</span>
                    <span className="text-white/70">{hoverInfo.re.toFixed(10)}</span>
                  </div>
                  <div className="flex justify-between bg-white/5 p-1.5 rounded">
                    <span className="text-white/30">Im:</span>
                    <span className="text-white/70">{hoverInfo.im.toFixed(10)}</span>
                  </div>
                  <div className="flex justify-between bg-purple-500/20 p-1.5 rounded border border-purple-500/30 font-bold mt-1 shadow-[0_0_10px_rgba(168,85,247,0.1)]">
                    <span className="text-purple-300/60 uppercase text-[8px] self-center">Iterations:</span>
                    <span className="text-white text-[10px]">{hoverInfo.iterations}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 8K-Export: rendert Offscreen-Canvas in 7680×4320 und lädt es herunter */}
            <div className="pt-4 border-t border-white/10">
              <button 
                onClick={handleCapture8K}
                onMouseDown={stopEvent}
                disabled={isCapturing}
                className="w-full bg-gradient-to-r from-emerald-600/20 to-teal-500/20 hover:from-emerald-600/30 hover:to-teal-500/30 border border-emerald-500/30 py-3 rounded-xl transition-all group flex items-center justify-center disabled:opacity-50 active:scale-[0.98]"
              >
                <svg className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <div className="text-left">
                  <div className="text-[10px] font-black uppercase text-emerald-400 leading-none tracking-wider">Download 8K Ultra-HD</div>
                  <div className="text-[8px] text-emerald-500/60 font-mono mt-0.5">Prioritizing Apple HEIC Format</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Chat-Verlauf (neueste Nachrichten oben) */}
        {!isPaletteOpen && messages.length > 0 && (
          <div 
            className="pointer-events-auto w-full lg:w-80 max-h-[20vh] lg:max-h-[30vh] overflow-y-auto space-y-2 no-scrollbar animate-in fade-in duration-300 lg:px-0 px-5 pb-5 lg:pb-0" 
            onMouseDown={stopEvent}
            onMouseUp={stopEvent}
            onClick={stopEvent}
          >
            {messages.slice().reverse().map((msg, idx) => (
              <div key={idx} className={`p-4 rounded-xl text-sm border backdrop-blur-md ${
                msg.role === 'assistant' 
                  ? 'bg-purple-900/20 border-purple-500/30 text-purple-100 shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
                  : 'bg-white/5 border-white/10 text-white/80'
              }`}>
                {msg.content}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tastenkürzel-Hilfe (nur Desktop) */}
      <div className="absolute top-6 right-6 z-10 pointer-events-none hidden lg:block">
        <div 
          className="bg-black/40 backdrop-blur-md border border-white/10 p-3 rounded-xl text-[9px] uppercase tracking-widest text-white/40 space-y-1 shadow-lg pointer-events-auto" 
          onMouseDown={stopEvent}
          onMouseUp={stopEvent}
          onClick={stopEvent}
        >
          <div className="flex justify-between gap-4"><span>Left Click</span> <span className="text-white/70">Zoom In</span></div>
          <div className="flex justify-between gap-4"><span>Shift + Click</span> <span className="text-white/70">Zoom Out</span></div>
          <div className="flex justify-between gap-4"><span>Scroll</span> <span className="text-white/70">Precise Zoom</span></div>
          <div className="flex justify-between gap-4"><span>Drag</span> <span className="text-white/70">Pan</span></div>
        </div>
      </div>

      {/* Gemini-Suchleiste (unten mittig) */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl px-4">
        <form 
          onSubmit={handleDiscovery} 
          className="relative group pointer-events-auto" 
          onMouseDown={stopEvent}
          onMouseUp={stopEvent}
          onClick={stopEvent}
        >
          <input
            type="text"
            placeholder="Ask Gemini to find a landmark (e.g. 'Show me Seahorse Valley')"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={isLoading || isCapturing}
            className="w-full bg-black/60 backdrop-blur-2xl border border-white/20 rounded-full py-4 pl-6 pr-32 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all shadow-2xl"
          />
          <button
            type="submit"
            disabled={isLoading || isCapturing || !chatInput}
            className="absolute right-2 top-2 bottom-2 px-6 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-full text-xs font-bold uppercase transition-all shadow-lg active:scale-95"
          >
            {isLoading ? 'Warping...' : 'Explore'}
          </button>
        </form>
      </div>

      {/* Dezente Vignette-Abdunkelung an den Rändern des Canvas */}
      <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10 shadow-[inset_0_0_180px_rgba(0,0,0,0.9)]"></div>
    </div>
  );
};

export default App;
