// Ein Reel = mehrere Segmente. "avatar" = Influencer spricht in die Kamera (Higgsfield Speak),
// "broll" = Szene/Clip mit Voiceover darüber (Higgsfield Soul-Bild -> DoP-Video).
export type Word = { w: string; start: number; end: number };

export type Segment = {
  type: "avatar" | "broll";
  text: string;          // gesprochener Text dieses Segments
  visual: string;        // EN Prompt: Szene/Kamera/Emotion
  onscreen?: string;     // optionaler Text-Overlay (z.B. "FEHLER #1")
  audioUrl?: string;
  audioPath?: string;    // lokale Datei (für Schnitt)
  duration?: number;     // Sekunden (aus TTS-Alignment)
  words?: Word[];        // Wort-Timings für Untertitel
  imageUrl?: string;     // B-Roll Standbild
  hfRequestId?: string;
  clipUrl?: string;
  status?: "pending" | "voiced" | "image" | "rendering" | "done" | "failed";
};

export const parseSegments = (s: string): Segment[] => {
  try { return JSON.parse(s) as Segment[]; } catch { return []; }
};

export const scriptText = (segs: Segment[]) => segs.map((s) => s.text).join(" ");
export const totalSeconds = (segs: Segment[]) => segs.reduce((a, s) => a + (s.duration ?? 0), 0);
