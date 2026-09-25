import { cfg } from "./config";

/** ElevenLabs Text-to-Speech mit fester Influencer-Stimme -> MP3 */
export async function synthesize(text: string, voiceId: string): Promise<ArrayBuffer> {
  if (cfg.mock) return new ArrayBuffer(0);
  if (!cfg.eleven.key) throw new Error("ELEVENLABS_API_KEY fehlt");
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": cfg.eleven.key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({
        text,
        model_id: cfg.eleven.model,
        voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.arrayBuffer();
}
