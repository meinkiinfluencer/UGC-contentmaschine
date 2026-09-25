import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Avatar, Brand } from "@prisma/client";
import { cfg } from "./config";

const client = () => new Anthropic();

// Server-seitiger Fallback, falls ein Request von Safety-Klassifikatoren abgelehnt wird.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

// ---------- 1. Trend-Research (Claude + Web Search) ----------

export async function researchTrends(niche: string, brand: Brand, platforms: string): Promise<string> {
  if (cfg.mock) return mockResearch(niche);

  const prompt = `Du bist Social-Media-Trend-Analyst für den DACH-Markt.
Nische: "${niche}"
Marke: ${brand.name} – ${brand.description}
Zielgruppe: ${brand.audience}
Plattformen: ${platforms}
Datum: ${new Date().toISOString().slice(0, 10)}

Recherchiere im Web, was in dieser Nische AKTUELL (letzte 2–4 Wochen) auf TikTok, Instagram Reels und Facebook viral geht:
1. Top 8 virale/trendende Themen & Content-Ideen (mit kurzer Begründung, warum sie funktionieren)
2. Aktuelle Trend-Formate (z.B. "POV", "3 Fehler die…", "Storytime", "Mythos vs. Fakt") passend für UGC-Talking-Head-Videos
3. Die stärksten Hook-Muster (erste 2 Sekunden)
4. Relevante Hashtags (DE + international)
5. Themen, die man vermeiden sollte (übersättigt/riskant)

Antworte kompakt und strukturiert als Markdown. Nenne Quellen.`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  let res = await client().beta.messages.create({
    model: cfg.claudeModel,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
    messages,
    ...FALLBACK,
  });
  // Server-Tool-Loop kann pausieren -> fortsetzen
  for (let i = 0; res.stop_reason === "pause_turn" && i < 5; i++) {
    res = await client().beta.messages.create({
      model: cfg.claudeModel,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages: [...messages, { role: "assistant", content: res.content }],
      ...FALLBACK,
    });
  }
  if (res.stop_reason === "refusal") throw new Error("Claude hat die Trend-Recherche abgelehnt");
  return res.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

// ---------- 2. Ideen + Scripts im Branding & Avatar-Stil ----------

const ContentIdea = z.object({
  title: z.string().describe("Interner Titel"),
  trend: z.string().describe("Auf welchem Trend/Thema die Idee basiert"),
  hook: z.string().describe("Hook – erster Satz, max 10 Wörter"),
  script: z.string().describe("Kompletter gesprochener Text inkl. Hook und CTA"),
  duration: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  scene: z.string().describe("Englischer Szenen-/Motion-Prompt für das Avatar-Video (Setting, Kamera, Gestik, Emotion)"),
  caption: z.string().describe("Post-Caption inkl. CTA, ohne Hashtags"),
  hashtags: z.array(z.string()).describe("5–12 Hashtags ohne #"),
});
const IdeasSchema = z.object({ ideas: z.array(ContentIdea) });
export type Idea = z.infer<typeof ContentIdea>;

export async function generateScripts(opts: {
  niche: string;
  goal: string;
  research: string;
  brand: Brand;
  avatar: Avatar;
  count: number;
}): Promise<Idea[]> {
  const { niche, goal, research, brand, avatar, count } = opts;
  if (cfg.mock) return mockIdeas(niche, avatar, count);

  const system = `Du bist Head of Content einer UGC-Agentur. Du schreibst virale Kurzvideo-Scripts für einen festen KI-Influencer.

MARKE
Name: ${brand.name}
Angebot: ${brand.description}
Zielgruppe: ${brand.audience}
Tonalität: ${brand.tone}
Standard-CTA: ${brand.cta}
Basis-Hashtags: ${brand.hashtags}
Regeln: ${brand.rules || "-"}
Sprache: ${brand.language}

INFLUENCER (spricht immer selbst in die Kamera, Selfie/UGC-Stil)
Name: ${avatar.name}
Persona: ${avatar.persona}

SCRIPT-REGELN
- Gesprochene Sprache, kurze Sätze, keine Emojis, keine Regieanweisungen im script.
- Hook in den ersten 2 Sekunden, dann Mehrwert, dann CTA.
- Länge passend zur duration: 5s ≈ 12 Wörter, 10s ≈ 24 Wörter, 15s ≈ 36 Wörter. Niemals mehr.
- Jede Idee muss auf einem konkreten Trend aus der Recherche basieren.
- Keine falschen Versprechen, keine Heilsversprechen, rechtlich sauber (DE/UWG).`;

  const res = await client().beta.messages.parse({
    model: cfg.claudeModel,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system,
    messages: [
      {
        role: "user",
        content: `Nische: ${niche}\nZiel: ${goal || "Reichweite + Leads"}\n\nTREND-RECHERCHE:\n${research}\n\nErstelle genau ${count} unterschiedliche Video-Ideen mit fertigem Script.`,
      },
    ],
    output_config: { format: betaZodOutputFormat(IdeasSchema) },
    ...FALLBACK,
  });
  if (res.stop_reason === "refusal") throw new Error("Claude hat die Script-Erstellung abgelehnt");
  if (!res.parsed_output) throw new Error("Scripts konnten nicht geparst werden");
  return res.parsed_output.ideas.slice(0, count);
}

// ---------- Mock-Daten (MOCK_MODE=true) ----------

function mockResearch(niche: string) {
  return `## Trends in "${niche}" (Mock)
1. "3 Fehler, die jeder macht" – Listen-Format, hohe Watchtime
2. POV-Storytelling – hohe Kommentarrate
3. Mythos vs. Fakt – starke Shares
Hooks: "Hör auf, …", "Niemand sagt dir, dass …"
Hashtags: #${niche.replace(/\s+/g, "")} #tipps #fyp`;
}

function mockIdeas(niche: string, avatar: Avatar, count: number): Idea[] {
  const formats = ["3 Fehler", "Mythos vs. Fakt", "POV", "Storytime", "Quick Tipp"];
  return Array.from({ length: count }, (_, i) => ({
    title: `${formats[i % formats.length]} – ${niche}`,
    trend: formats[i % formats.length],
    hook: `Hör auf, das bei ${niche} falsch zu machen!`,
    script: `Hör auf, das bei ${niche} falsch zu machen! Ich bin ${avatar.name} und zeige dir heute den einen Trick, der alles ändert. Folg mir für mehr.`,
    duration: 15 as const,
    scene: "Young creator filming selfie video in bright apartment, handheld, talking to camera, excited expression",
    caption: `Der eine Trick für ${niche}, den dir keiner sagt 👇 Speichern & teilen!`,
    hashtags: [niche.replace(/\s+/g, "").toLowerCase(), "tipps", "ugc", "fyp"],
  }));
}
