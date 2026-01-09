
import { GoogleGenAI, Type } from "@google/genai";
import { Viewport, Discovery } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const getDiscoveryInfo = async (prompt: string, currentView: Viewport): Promise<Discovery | null> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `User asks: ${prompt}. Current coordinates: x=${currentView.x}, y=${currentView.y}, zoom=${currentView.zoom}.`,
      config: {
        systemInstruction: `You are a mathematical fractal expert. Your task is to help the user navigate the Mandelbrot set. 
        If they ask to see something specific (like 'Seahorse Valley', 'Elephant Valley', 'Mini-mandelbrot') or just 'something beautiful', 
        provide the precise (x, y) coordinates and zoom level to view it. 
        Note: The Mandelbrot set is centered around (0,0) and roughly spans -2 to 0.5 on X and -1.2 to 1.2 on Y. 
        High zoom is usually > 1000. Maximum zoom for this engine is ~1e13.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            x: { type: Type.NUMBER },
            y: { type: Type.NUMBER },
            zoom: { type: Type.NUMBER },
            description: { type: Type.STRING }
          },
          required: ["name", "x", "y", "zoom", "description"]
        }
      }
    });

    const result = JSON.parse(response.text.trim());
    return result as Discovery;
  } catch (error) {
    console.error("Gemini discovery error:", error);
    return null;
  }
};

export const chatWithAssistant = async (history: {role: string, content: string}[], message: string) => {
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: "You are a poetic and brilliant mathematician specializing in fractal geometry. Explain the beauty, complexity, and infinity of the Mandelbrot set. Keep answers concise but inspiring."
    }
  });

  // Convert history to Gemini format if needed, but for simplicity we'll just send the current message
  // in this wrapper since we mainly use discovery for navigation.
  const response = await chat.sendMessage({ message });
  return response.text;
};
