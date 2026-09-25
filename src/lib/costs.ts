import { db } from "./db";

const num = (k: string, d: number) => Number(process.env[k] ?? "") || d;

// Preise in USD. Higgsfield-Werte = Schätzungen (Spannen laut öffentlichen Preisübersichten) –
// mit echtem Credit-Verbrauch im Higgsfield-Dashboard abgleichen und in .env anpassen.
export const PRICES = {
  claudeInPerM: num("PRICE_CLAUDE_IN_PER_M", 5),        // claude-opus-5 $/1M Input
  claudeOutPerM: num("PRICE_CLAUDE_OUT_PER_M", 25),     // $/1M Output
  webSearch: num("PRICE_WEB_SEARCH", 0.01),             // $/Suche
  elevenPer1kChars: num("PRICE_ELEVEN_PER_1K", 0.2),    // Creator/Pro-Plan ≈ 0,15–0,30
  hfSpeakPerSec: num("PRICE_HF_SPEAK_PER_SEC", 0.15),   // Speak ≈ 0,86–4,22 $/Job
  hfSoulImage: num("PRICE_HF_SOUL_IMAGE", 0.18),        // Soul ≈ 0,12–0,23 $/Bild
  hfDop: num("PRICE_HF_DOP", 0.4),                      // DoP ≈ 0,16–0,70 $/Clip
  apifyPer1k: num("PRICE_APIFY_PER_1K", 0.5),           // Scraper $/1000 Ergebnisse
};

export async function track(brandId: string, provider: string, item: string, usd: number, contentId?: string) {
  if (!usd) return;
  await db.cost.create({ data: { brandId, provider, item, usd, contentId } });
  if (contentId) await db.content.update({ where: { id: contentId }, data: { costUsd: { increment: usd } } });
}

export function claudeCost(usage: {
  input_tokens: number; output_tokens: number;
  cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number } | null;
}) {
  const input = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * PRICES.claudeInPerM + usage.output_tokens * PRICES.claudeOutPerM) / 1e6
    + (usage.server_tool_use?.web_search_requests ?? 0) * PRICES.webSearch;
}

/** Kalkulation pro Reel (für Dashboard / Angebote) */
export function estimateReel(opts: { avatarSec: number; brollClips: number; chars: number }) {
  const speak = opts.avatarSec * PRICES.hfSpeakPerSec;
  const broll = opts.brollClips * (PRICES.hfSoulImage + PRICES.hfDop);
  const voice = (opts.chars / 1000) * PRICES.elevenPer1kChars;
  const llm = 0.25; // Research-Anteil + Script
  return { speak, broll, voice, llm, total: speak + broll + voice + llm };
}
