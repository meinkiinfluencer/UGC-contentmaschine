const env = (k: string, d = "") => process.env[k]?.trim() || d;

export const cfg = {
  mock: env("MOCK_MODE") === "true",
  claudeModel: env("CLAUDE_MODEL", "claude-opus-5"),
  hf: {
    credentials: env("HF_CREDENTIALS"),
    baseUrl: env("HF_BASE_URL", "https://api.higgsfield.ai"),
    endpoint: env("HF_VIDEO_ENDPOINT", "/v1/speak/higgsfield"),
    quality: env("HF_QUALITY", "high") as "mid" | "high",
  },
  eleven: { key: env("ELEVENLABS_API_KEY"), model: env("ELEVENLABS_MODEL", "eleven_multilingual_v2") },
  ayrshare: { key: env("AYRSHARE_API_KEY"), profileKey: env("AYRSHARE_PROFILE_KEY") },
  publicBaseUrl: env("PUBLIC_BASE_URL"),
  autoApproveScripts: env("AUTO_APPROVE_SCRIPTS") === "true",
  autoApproveVideos: env("AUTO_APPROVE_VIDEOS") === "true",
  postSlots: env("POST_SLOTS", "11:30,18:00").split(",").map((s) => s.trim()).filter(Boolean),
  timezone: env("TIMEZONE", "Europe/Berlin"),
  workerIntervalSec: Number(env("WORKER_INTERVAL_SEC", "20")),
  autoRunCron: env("AUTO_RUN_CRON"),
  autoRunNiche: env("AUTO_RUN_NICHE"),
};
