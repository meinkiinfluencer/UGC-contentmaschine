import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Avatar, Brand } from "@prisma/client";
import { cfg } from "./config";
import { claudeCost } from "./costs";
import type { Segment } from "./segments";

const client = () => new Anthropic();

// Server-seitiger Fallback, falls ein Request von Safety-Klassifikatoren abgelehnt wird.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

export const FORMATS: Record<string, string> = {
  storytelling: "Storytime: persönliche Geschichte mit Wendepunkt (Problem → Tiefpunkt → Erkenntnis → Ergebnis)",
  problem_solution: "Problem-Agitation-Lösung: Schmerz benennen, verstärken, Lösung zeigen",
  tips_list: "Listicle: '3 Fehler/Tipps, die …' – jede Nummer als eigenes Segment mit Text-Overlay",
  myth_vs_fact: "Mythos vs. Fakt: verbreiteten Irrglauben zerlegen",
  pov: "POV: Zuschauer in eine konkrete Situation versetzen",
  testimonial: "UGC-Testimonial: ehrliche Erfahrung mit Produkt/Dienstleistung, Vorher/Nachher",
  behind_the_scenes: "Behind the Scenes / Day in the Life",
  hot_take: "Kontroverse Meinung (Hot Take), die Kommentare triggert",
  reaction: "Reaction/Antwort auf häufige Frage oder Kommentar",
};

// ---------- 1. Trend-Research (Claude + Web Search [+ Apify-Daten]) ----------

export async function researchTrends(i: { niche: string; brand: Brand; scraped: string }): Promise<{ text: string; costUsd: number }> {
  if (cfg.mock) return { text: mockResearch(i.niche), costUsd: 0 };
  const { niche, brand, scraped } = i;
  const prompt = `Du bist Social-Media-Trend-Analyst für den DACH-Markt.
Nische: "${niche}"
Marke: ${brand.name} – ${brand.description}
Zielgruppe: ${brand.audience}
Plattformen: ${brand.platforms}
Datum: ${new Date().toISOString().slice(0, 10)}
${scraped ? `\nECHTE DATEN – aktuell viralste Posts zu den Nischen-Hashtags:\n${scraped}\n` : ""}
Recherchiere im Web, was in dieser Nische AKTUELL (letzte 2–4 Wochen) auf TikTok, Instagram Reels und Facebook viral geht${scraped ? " und analysiere die echten Daten oben" : ""}:
1. Top 8 virale Themen/Content-Ideen mit Begründung (warum funktioniert es: Emotion, Kontroverse, Nutzen, Relatability)
2. Trend-Formate für UGC-Reels (30–60 s) inkl. Storytelling-Muster
3. Die 10 stärksten Hook-Muster (erste 2 Sekunden) mit Beispielsätzen auf Deutsch
4. Retention-Tricks (Open Loops, Pattern Interrupts, Payoff am Ende, Loop-Ending)
5. Relevante Hashtags (DE + international)
6. Übersättigte/riskante Themen, die man meiden sollte

Kompakt, strukturiert, Markdown, Quellen nennen.`;

  const tools: Anthropic.Beta.BetaToolUnion[] = [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let costUsd = 0;
  let res = await client().beta.messages.create({ model: cfg.claudeModel, max_tokens: 16000, thinking: { type: "adaptive" }, tools, messages, ...FALLBACK });
  costUsd += claudeCost(res.usage);
  for (let n = 0; res.stop_reason === "pause_turn" && n < 5; n++) {
    res = await client().beta.messages.create({
      model: cfg.claudeModel, max_tokens: 16000, thinking: { type: "adaptive" }, tools,
      messages: [...messages, { role: "assistant", content: res.content }], ...FALLBACK,
    });
    costUsd += claudeCost(res.usage);
  }
  if (res.stop_reason === "refusal") throw new Error("Claude hat die Trend-Recherche abgelehnt");
  const text = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("").trim();
  return { text, costUsd };
}

// ---------- 2. Ideen + mehrteilige Reel-Scripts ----------

const SegmentSchema = z.object({
  type: z.enum(["avatar", "broll"]).describe("avatar = Influencer spricht in Kamera; broll = Szene mit Voiceover"),
  text: z.string().describe("Gesprochener Text dieses Segments"),
  visual: z.string().describe("Englischer Bild-/Motion-Prompt: Setting, Kamera, Licht, Aktion, Emotion"),
  onscreen: z.string().describe("Kurzer Text-Overlay (max 5 Wörter) oder leer"),
});
const IdeaSchema = z.object({
  title: z.string(),
  format: z.string().describe("Format-Key aus der Liste"),
  trend: z.string().describe("Auf welchem Trend/Thema die Idee basiert"),
  hook: z.string().describe("Hook-Satz (= Anfang des ersten Segments)"),
  segments: z.array(SegmentSchema),
  caption: z.string().describe("Caption: Hook-Zeile, 2–4 kurze Zeilen Mehrwert, CTA, Frage für Kommentare. Ohne Hashtags"),
  hashtags: z.array(z.string()).describe("5–12 Hashtags ohne #"),
  viral_score: z.number().describe("1–10 ehrliche Einschätzung des Viral-Potenzials"),
});
export type Idea = Omit<z.infer<typeof IdeaSchema>, "segments"> & { segments: Segment[] };

export async function generateScripts(o: {
  niche: string; goal: string; research: string; brand: Brand; avatar: Avatar; count: number; recentTitles: string[];
}): Promise<{ ideas: Idea[]; costUsd: number }> {
  const { niche, goal, research, brand, avatar, count, recentTitles } = o;
  if (cfg.mock) return { ideas: mockIdeas(niche, avatar, count), costUsd: 0 };
  const formats = brand.formats.split(",").map((f) => f.trim()).filter((f) => FORMATS[f]);
  const target = brand.targetSeconds;
  const words = Math.round(target * 2.5);

  const system = `Du bist Head of Content einer UGC-Agentur und schreibst virale Reels (TikTok, Instagram, Facebook) für einen festen KI-Influencer.

MARKE
Name: ${brand.name}
Angebot: ${brand.description}
Zielgruppe: ${brand.audience}
Tonalität: ${brand.tone}
Standard-CTA: ${brand.cta}
Content-Säulen: ${brand.pillars || "-"}
Regeln: ${brand.rules || "-"}
Sprache: ${brand.language}

INFLUENCER
Name: ${avatar.name}
Persona: ${avatar.persona}
Aussehen: ${avatar.look || "-"}

ERLAUBTE FORMATE
${formats.map((f) => `- ${f}: ${FORMATS[f]}`).join("\n")}

REEL-AUFBAU (${target} s ≈ ${words} Wörter gesamt, 2,5 Wörter/s)
- Segment 1 = HOOK, immer "avatar", max 2 Sätze, Pattern-Interrupt/Neugier/Kontroverse – entscheidet über Watchtime.
- 4–8 Segmente. Wechsel zwischen "avatar" (Gesicht, Vertrauen) und "broll" (Szenen, die das Gesagte zeigen) = Tempo.
- "avatar"-Segmente: je max 30 Wörter (≤ 12 s). Insgesamt höchstens 3 avatar-Segmente (Kosten!).
- "broll"-Segmente: je max 12 Wörter (≤ 5 s), visual = konkrete, filmische 9:16-Szene ohne Text im Bild.
- Open Loop früh ("…und Punkt 3 hat alles verändert"), Payoff am Ende, dann CTA im letzten avatar-Segment.
- Gesprochene Sprache, kurze Sätze, keine Emojis, keine Regieanweisungen im text.
- Rechtlich sauber (UWG/HWG), keine Heilsversprechen, keine erfundenen Zahlen.`;

  const res = await client().beta.messages.parse({
    model: cfg.claudeModel,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    system,
    messages: [{
      role: "user",
      content: `Nische: ${niche}\nZiel: ${goal || brand.goal || "Reichweite + Leads"}\n\nTREND-RECHERCHE:\n${research}\n\nBEREITS PRODUZIERT (nicht wiederholen):\n${recentTitles.join("\n") || "-"}\n\nErstelle ${count + 2} unterschiedliche Reel-Ideen mit fertigem Script, verschiedene Formate mischen, jede auf einem konkreten Trend basierend.`,
    }],
    output_config: { format: betaZodOutputFormat(z.object({ ideas: z.array(IdeaSchema) })) },
    ...FALLBACK,
  });
  const costUsd = claudeCost(res.usage);
  if (res.stop_reason === "refusal") throw new Error("Claude hat die Script-Erstellung abgelehnt");
  if (!res.parsed_output) throw new Error("Scripts konnten nicht geparst werden");
  // beste Ideen nach Viral-Score behalten
  const ideas = res.parsed_output.ideas
    .sort((a, b) => b.viral_score - a.viral_score)
    .slice(0, count)
    .map((i) => ({ ...i, segments: i.segments.map((s) => ({ ...s, onscreen: s.onscreen || undefined, status: "pending" as const })) }));
  return { ideas, costUsd };
}

// ---------- Mock-Daten (MOCK_MODE=true) ----------

function mockResearch(niche: string) {
  return `## Trends in "${niche}" (Mock)
1. "3 Fehler, die jeder macht" – Listen-Format, hohe Watchtime
2. Storytime mit Wendepunkt – hohe Kommentarrate
Hooks: "Hör auf, …", "Niemand sagt dir, dass …"`;
}

function mockIdeas(niche: string, avatar: Avatar, count: number): Idea[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `3 Fehler bei ${niche} #${i + 1}`,
    format: "tips_list",
    trend: "3 Fehler",
    hook: `Hör auf, diese drei Fehler bei ${niche} zu machen!`,
    viral_score: 7,
    caption: `3 Fehler bei ${niche}, die dich ausbremsen 👇\nSpeichern & teilen!`,
    hashtags: [niche.replace(/\s+/g, "").toLowerCase(), "tipps", "ugc"],
    segments: [
      { type: "avatar", text: `Hör auf, diese drei Fehler bei ${niche} zu machen! Ich bin ${avatar.name} und Nummer drei hat bei mir alles verändert.`, visual: "talking to camera, excited", onscreen: "3 FEHLER", status: "pending" },
      { type: "broll", text: "Fehler eins: Du startest ohne Plan.", visual: "person staring at empty notebook, moody light", onscreen: "FEHLER #1", status: "pending" },
      { type: "broll", text: "Fehler zwei: Du willst alles auf einmal.", visual: "cluttered desk, fast hands, chaos", onscreen: "FEHLER #2", status: "pending" },
      { type: "avatar", text: "Und Fehler drei: Du gibst zu früh auf. Folg mir, wenn du dranbleiben willst!", visual: "smiling, pointing at camera", onscreen: "FEHLER #3", status: "pending" },
    ],
  }));
}
