import { cfg } from "./config";
import { ffmpegPath, run } from "./video";
import type { Word } from "./segments";

export type Voiced = { audio: Buffer; duration: number; words: Word[] };

/** ElevenLabs TTS inkl. Zeichen-Timings (-> Wort-Timings für Untertitel) */
export async function synthesize(text: string, voiceId: string, ctx: { previous?: string; next?: string } = {}): Promise<Voiced> {
  if (cfg.mock) return mockVoice(text);
  if (!cfg.eleven.key) throw new Error("ELEVENLABS_API_KEY fehlt");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": cfg.eleven.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: cfg.eleven.model,
        previous_text: ctx.previous || undefined, // flüssiger Übergang zwischen Segmenten
        next_text: ctx.next || undefined,
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.4, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    audio_base64: string;
    alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  };
  const a = json.alignment;
  const words: Word[] = [];
  let cur: Word | null = null;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) words.push(cur); cur = null; return; }
    if (!cur) cur = { w: "", start: a.character_start_times_seconds[i], end: 0 };
    cur.w += ch;
    cur.end = a.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  const duration = (a.character_end_times_seconds.at(-1) ?? 0) + 0.25;
  return { audio: Buffer.from(json.audio_base64, "base64"), duration, words };
}

/** Stimmen des ElevenLabs-Accounts (für Avatar-Setup) */
export async function listVoices(): Promise<{ id: string; name: string; labels: string }[]> {
  if (!cfg.eleven.key) return [];
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": cfg.eleven.key } });
  if (!res.ok) return [];
  const json = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
  return json.voices.map((v) => ({ id: v.voice_id, name: v.name, labels: Object.values(v.labels ?? {}).join(", ") }));
}

// Mock: stilles Audio in realistischer Länge (2,6 Wörter/s) + synthetische Timings
async function mockVoice(text: string): Promise<Voiced> {
  const tokens = text.split(/\s+/).filter(Boolean);
  const per = 1 / 2.6;
  const words = tokens.map((w, i) => ({ w, start: i * per, end: (i + 1) * per - 0.05 }));
  const duration = tokens.length * per + 0.25;
  const audio = await run(ffmpegPath(), [
    "-f", "lavfi", "-i", `sine=frequency=220:duration=${duration.toFixed(2)}`, "-af", "volume=0.05",
    "-f", "mp3", "pipe:1",
  ]);
  return { audio, duration, words };
}
