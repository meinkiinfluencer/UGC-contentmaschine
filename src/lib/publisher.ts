import { cfg } from "./config";

// Ayrshare: ein API-Call -> Instagram Reels, TikTok, Facebook Reels (inkl. Scheduling)
// Business-Plan: pro Kunde ein Profil -> Profile-Key je Marke.
export async function schedulePost(i: {
  caption: string; videoUrl: string; platforms: string[]; scheduledAt: Date; profileKey?: string;
}): Promise<string> {
  if (cfg.mock) return `mock-post-${Date.now()}`;
  if (!cfg.ayrshare.key) throw new Error("AYRSHARE_API_KEY fehlt");
  const headers: Record<string, string> = { Authorization: `Bearer ${cfg.ayrshare.key}`, "Content-Type": "application/json" };
  if (i.profileKey) headers["Profile-Key"] = i.profileKey;
  const res = await fetch("https://api.ayrshare.com/api/post", {
    method: "POST",
    headers,
    body: JSON.stringify({
      post: i.caption,
      platforms: i.platforms,
      mediaUrls: [i.videoUrl],
      isVideo: true,
      scheduleDate: i.scheduledAt.toISOString(),
      instagramOptions: { reels: true, shareReelsFeed: true },
      faceBookOptions: { reels: true },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!res.ok || json.status === "error") throw new Error(`Ayrshare ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);
  return json.id ?? "unknown";
}
