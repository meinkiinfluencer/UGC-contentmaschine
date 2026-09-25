import { cfg } from "./config";
import { PRICES } from "./costs";

// Optional: echte Performance-Daten viraler Videos via Apify (TikTok + Instagram).
// Ohne APIFY_TOKEN übernimmt die Claude-Websuche allein.

type Viral = { platform: string; text: string; views: number; likes: number; comments: number; shares: number; url: string };

async function actor<T>(actorId: string, input: object): Promise<T[]> {
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${cfg.apify.token}&timeout=240`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
  );
  if (!res.ok) throw new Error(`Apify ${actorId} ${res.status}`);
  return (await res.json()) as T[];
}

export async function scrapeViral(hashtags: string[]): Promise<{ text: string; costUsd: number }> {
  if (!cfg.apify.token || cfg.mock || !hashtags.length) return { text: "", costUsd: 0 };
  const tags = hashtags.slice(0, 4).map((h) => h.replace(/^#/, ""));
  const results = await Promise.allSettled([
    actor<Record<string, any>>("clockworks~tiktok-scraper", { hashtags: tags, resultsPerPage: 25, shouldDownloadVideos: false }),
    actor<Record<string, any>>("apify~instagram-hashtag-scraper", { hashtags: tags, resultsLimit: 25 }),
  ]);
  const items: Viral[] = [];
  if (results[0].status === "fulfilled")
    for (const x of results[0].value)
      items.push({ platform: "tiktok", text: x.text ?? "", views: x.playCount ?? 0, likes: x.diggCount ?? 0, comments: x.commentCount ?? 0, shares: x.shareCount ?? 0, url: x.webVideoUrl ?? "" });
  if (results[1].status === "fulfilled")
    for (const x of results[1].value)
      items.push({ platform: "instagram", text: x.caption ?? "", views: x.videoViewCount ?? x.videoPlayCount ?? 0, likes: x.likesCount ?? 0, comments: x.commentsCount ?? 0, shares: 0, url: x.url ?? "" });

  const costUsd = (items.length / 1000) * PRICES.apifyPer1k;
  const top = items
    .map((v) => ({ ...v, score: v.views + v.likes * 20 + v.comments * 50 + v.shares * 80 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  const text = top
    .map((v) => `- [${v.platform}] ${v.views.toLocaleString("de-DE")} Views, ${v.likes} Likes, ${v.comments} Komm., ${v.shares} Shares: "${v.text.slice(0, 220).replace(/\s+/g, " ")}" ${v.url}`)
    .join("\n");
  return { text, costUsd };
}
