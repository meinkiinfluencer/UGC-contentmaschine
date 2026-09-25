const env = (k: string, d = "") => process.env[k]?.trim() || d;

export const cfg = {
  mock: env("MOCK_MODE") === "true",
  claudeModel: env("CLAUDE_MODEL", "claude-opus-5"),
  hf: {
    credentials: env("HF_CREDENTIALS"),
    baseUrl: env("HF_BASE_URL", "https://api.higgsfield.ai"),
    speakEndpoint: env("HF_SPEAK_ENDPOINT", "/v1/speak/higgsfield"),
    imageEndpoint: env("HF_IMAGE_ENDPOINT", "/v1/text2image/soul"),
    i2vEndpoint: env("HF_I2V_ENDPOINT", "/v1/image2video/dop"),
    i2vModel: env("HF_I2V_MODEL", "dop-turbo"),
    quality: env("HF_QUALITY", "mid") as "mid" | "high",
  },
  eleven: { key: env("ELEVENLABS_API_KEY"), model: env("ELEVENLABS_MODEL", "eleven_multilingual_v2") },
  ayrshare: { key: env("AYRSHARE_API_KEY") },
  apify: { token: env("APIFY_TOKEN") },
  publicBaseUrl: env("PUBLIC_BASE_URL"),
  workerIntervalSec: Number(env("WORKER_INTERVAL_SEC", "20")),
  // Untertitel-Font (muss auf dem Server installiert sein)
  subtitleFont: env("SUBTITLE_FONT", "DejaVu Sans"),
  musicUrl: env("BACKGROUND_MUSIC_URL"), // optional: Default-Musik (leise unterlegt)
};
