import { cfg } from "./config";

// Ayrshare: ein API-Call -> Instagram Reels, TikTok, Facebook (inkl. Scheduling)
// Docs: https://www.ayrshare.com/docs/apis/post/post
export async function schedulePost(input: {
  caption: string;
  videoUrl: string;
  platforms: string[];
  scheduledAt: Date;
}): Promise<string> {
  if (cfg.mock) return `mock-post-${Date.now()}`;
  if (!cfg.ayrshare.key) throw new Error("AYRSHARE_API_KEY fehlt");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.ayrshare.key}`,
    "Content-Type": "application/json",
  };
  if (cfg.ayrshare.profileKey) headers["Profile-Key"] = cfg.ayrshare.profileKey;

  const res = await fetch("https://api.ayrshare.com/api/post", {
    method: "POST",
    headers,
    body: JSON.stringify({
      post: input.caption,
      platforms: input.platforms,
      mediaUrls: [input.videoUrl],
      isVideo: true,
      scheduleDate: input.scheduledAt.toISOString(),
      instagramOptions: { reels: true, shareReelsFeed: true },
      faceBookOptions: { reels: true },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string; errors?: unknown };
  if (!res.ok || json.status === "error") throw new Error(`Ayrshare ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json.id ?? "unknown";
}
