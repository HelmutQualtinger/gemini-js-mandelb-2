
import React, { useState, useCallback, useRef, useEffect } from 'react';
import MandelbrotCanvas, { MandelbrotCanvasHandle } from './components/MandelbrotCanvas';
import { Viewport, PaletteType, Discovery, ChatMessage } from './types';
import { getDiscoveryInfo } from './services/geminiService';

const PALETTE_GRADIENTS: Record<PaletteType, string> = {
  [PaletteType.FIRE]: 'linear-gradient(to right, #000, #f00, #ff0, #fff)',
  [PaletteType.ULTRAVIOLET]: 'linear-gradient(to right, #4c1d95, #d946ef, #6366f1)',
  [PaletteType.GLACIER]: 'linear-gradient(to right, #001f3f, #0074d9, #7fdbff, #ffffff)',
  [PaletteType.CLASSIC]: 'linear-gradient(to right, #000, #888, #fff)',
  [PaletteType.ELECTRIC]: 'linear-gradient(to right, #0000ff, #00ffff, #ffffff)',
  [PaletteType.NEON]: 'linear-gradient(to right, #ff00ff, #00ffff, #000000)',
  [PaletteType.SUNSET]: 'linear-gradient(to right, #ff4500, #ffa500, #00008b)',
  [PaletteType.FOREST]: 'linear-gradient(to right, #002200, #008800, #88ff88)',
  [PaletteType.OCEAN]: 'linear-gradient(to right, #000033, #0000aa, #aaffff)',
  [PaletteType.GOLDEN]: 'linear-gradient(to right, #332200, #aa8800, #ffff88)',
  [PaletteType.COSMIC]: 'linear-gradient(to right, #220033, #8800ff, #ff88ff)'
};

const App: React.FC = () => {
  const [viewport, setViewport] = useState<Viewport>({ x: -0.5, y: 0, zoom: 1 });
  const [maxIterations, setMaxIterations] = useState(150);
  const [palette, setPalette] = useState<PaletteType>(PaletteType.FIRE);
  const [chatInput, setChatInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hoverInfo, setHoverInfo] = useState<{ re: number; im: number; iterations: number } | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const canvasRef = useRef<MandelbrotCanvasHandle>(null);
  const paletteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target as Node)) {
        setIsPaletteOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleViewChange = useCallback((newView: Viewport) => {
    setViewport(newView);
  }, []);

  const handleExport8K = async () => {
    if (!canvasRef.current || isExporting) return;
    setIsExporting(true);
    try {
      // 8K Resolution: 7680 x 4320
      const blob = await canvasRef.current.captureHighRes(7680, 4320);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fractal_8k_${viewport.x.toFixed(6)}_${viewport.y.toFixed(6)}_z${viewport.zoom.toExponential(2)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export 8K image. Your browser or GPU might limit offscreen canvas size.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDiscovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    setIsLoading(true);
    const userMsg = chatInput;
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);

    const discovery = await getDiscoveryInfo(userMsg, viewport);
    
    if (discovery) {
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
      {/* Fractal Engine */}
      <MandelbrotCanvas 
        ref={canvasRef}
        viewport={viewport} 
        maxIterations={maxIterations} 
        palette={palette}
        onViewChange={handleViewChange}
        onHover={setHoverInfo}
      />

      {/* Overlays */}
      <div className="absolute top-6 left-6 z-10 space-y-4 pointer-events-none">
        <div className="pointer-events-auto bg-black/60 backdrop-blur-md border border-white/10 p-4 rounded-xl shadow-2xl w-80">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
            Fractal Mind
          </h1>
          <p className="text-xs text-white/50 mt-1 uppercase tracking-widest font-semibold">Gemini Explorer</p>
          
          <div className="mt-6 space-y-4">
            <div>
              <label className="text-[10px] uppercase text-white/40 block mb-1">Precision (Iterations)</label>
              <input 
                type="range" 
                min="50" 
                max="3000" 
                step="50"
                value={maxIterations} 
                onChange={(e) => setMaxIterations(parseInt(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
              <div className="flex justify-between text-[10px] mt-1 text-white/60">
                <span>Fast</span>
                <span>{maxIterations}</span>
                <span>Deep</span>
              </div>
            </div>

            <div className="relative" ref={paletteRef}>
              <label className="text-[10px] uppercase text-white/40 block mb-1">Color Palette</label>
              <button
                onClick={() => setIsPaletteOpen(!isPaletteOpen)}
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-sm focus:outline-none hover:bg-white/10 transition-all flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-3 rounded-sm border border-white/10" style={{ background: PALETTE_GRADIENTS[palette] }}></div>
                  <span>{palette.charAt(0).toUpperCase() + palette.slice(1)}</span>
                </div>
                <svg className={`w-4 h-4 transition-transform ${isPaletteOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isPaletteOpen && (
                <div className="absolute top-full mt-2 w-full bg-zinc-900/95 border border-white/10 rounded-lg shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                  {Object.values(PaletteType).map((p) => (
                    <button
                      key={p}
                      onClick={() => {
                        setPalette(p);
                        setIsPaletteOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-xs hover:bg-white/10 transition-colors ${palette === p ? 'bg-white/5 text-purple-400' : 'text-white/70'}`}
                    >
                      <div className="w-10 h-3 rounded-sm border border-white/10" style={{ background: PALETTE_GRADIENTS[p] }}></div>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="text-[10px] uppercase text-white/40 mb-2 font-bold tracking-widest">Capture & Export</div>
              <button 
                onClick={handleExport8K}
                disabled={isExporting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-all shadow-lg active:scale-95 group"
              >
                {isExporting ? (
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-white/80 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                )}
                {isExporting ? 'Generating 8K...' : 'Download 8K Snapshot'}
              </button>
              <p className="text-[9px] text-white/30 text-center mt-2 italic">Lossless PNG Export • 7680x4320</p>
            </div>

            <div className="pt-2 border-t border-white/10">
              <div className="text-[10px] uppercase text-white/40 mb-2 font-bold tracking-widest">View Center</div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                <div className="bg-white/5 p-2 rounded truncate" title={viewport.x.toString()}>Re: {viewport.x.toFixed(8)}</div>
                <div className="bg-white/5 p-2 rounded truncate" title={viewport.y.toString()}>Im: {viewport.y.toFixed(8)}</div>
                <div className="bg-white/5 p-2 rounded col-span-2 truncate">Zoom: {viewport.zoom.toExponential(4)}</div>
              </div>
            </div>

            {hoverInfo && (
              <div className="pt-2 border-t border-purple-500/20 animate-in fade-in slide-in-from-top-1">
                <div className="text-[10px] uppercase text-purple-400 mb-2 font-bold tracking-widest">Cursor Insight</div>
                <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                  <div className="bg-purple-500/10 p-2 rounded truncate">Re: {hoverInfo.re.toFixed(10)}</div>
                  <div className="bg-purple-500/10 p-2 rounded truncate">Im: {hoverInfo.im.toFixed(10)}</div>
                  <div className="bg-purple-500/10 p-2 rounded col-span-2 truncate font-bold text-purple-300">
                    Iterations: {hoverInfo.iterations}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Discovery Feed */}
        <div className="pointer-events-auto w-80 max-h-[30vh] overflow-y-auto space-y-2 no-scrollbar">
          {messages.slice().reverse().map((msg, idx) => (
            <div key={idx} className={`p-3 rounded-lg text-sm border ${
              msg.role === 'assistant' 
                ? 'bg-purple-900/20 border-purple-500/30 text-purple-100 shadow-[0_0_15px_rgba(168,85,247,0.1)]' 
                : 'bg-white/5 border-white/10 text-white/80'
            }`}>
              {msg.content}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Command Bar */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 w-full max-w-xl px-4">
        <form onSubmit={handleDiscovery} className="relative group">
          <input
            type="text"
            placeholder="Ask Gemini to find a landmark (e.g. 'Show me Seahorse Valley')"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={isLoading}
            className="w-full bg-black/60 backdrop-blur-2xl border border-white/20 rounded-full py-4 pl-6 pr-32 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all placeholder:text-white/30 group-hover:border-white/40 shadow-2xl"
          />
          <button
            type="submit"
            disabled={isLoading || !chatInput}
            className="absolute right-2 top-2 bottom-2 px-6 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:bg-white/10 rounded-full text-xs font-bold uppercase tracking-wider transition-colors shadow-lg"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-3 w-3 text-white" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Warping
              </span>
            ) : 'Explore'}
          </button>
        </form>
        <div className="flex justify-center gap-6 mt-4 text-[10px] text-white/40 uppercase tracking-widest font-medium">
          <span>Scroll to Zoom</span>
          <span className="w-px h-3 bg-white/20"></span>
          <span>Click & Drag to Pan</span>
          <span className="w-px h-3 bg-white/20"></span>
          <span>AI Navigation</span>
        </div>
      </div>

      {/* Vignette Overlay */}
      <div className="absolute inset-0 pointer-events-none ring-1 ring-inset ring-white/10 shadow-[inset_0_0_180px_rgba(0,0,0,0.9)]"></div>
    </div>
  );
};

export default App;
