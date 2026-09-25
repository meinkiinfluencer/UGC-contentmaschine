import path from "node:path";
import fs from "node:fs/promises";
import { db, log } from "./db";
import { cfg } from "./config";
import { researchTrends, generateScripts } from "./llm";
import { scrapeViral } from "./trends";
import { synthesize } from "./tts";
import { uploadFile, submitSpeak, submitImage, submitImageToVideo, getStatus, waitFor } from "./higgsfield";
import { schedulePost } from "./publisher";
import { nextFreeSlot } from "./slots";
import { PRICES, track } from "./costs";
import { parseSegments, type Segment } from "./segments";
import { composeReel, mockClip } from "./video";
import { download, ensureDir, localUrl, saveFile } from "./storage";

const MAX_ATTEMPTS = 3;
const hooks = () => (cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/api/webhooks/higgsfield` : undefined);

/** Atomar Status wechseln – verhindert Doppelverarbeitung */
async function claim(id: string, from: string, to: string) {
  const r = await db.content.updateMany({ where: { id, status: from }, data: { status: to } });
  return r.count === 1;
}

async function fail(id: string, step: string, err: unknown, retryStatus: string) {
  const msg = err instanceof Error ? err.message : String(err);
  const c = await db.content.update({ where: { id }, data: { attempts: { increment: 1 }, error: msg } });
  const giveUp = c.attempts >= MAX_ATTEMPTS;
  await db.content.update({ where: { id }, data: { status: giveUp ? "FAILED" : retryStatus } });
  await log(giveUp ? "error" : "retry", `${step}: ${msg}`, { contentId: id });
}

const saveSegs = (id: string, segs: Segment[]) => db.content.update({ where: { id }, data: { segments: JSON.stringify(segs) } });

// ---------- Schritt 1: Run -> (Scraping) -> Research -> Scripts ----------

export async function processRun(runId: string) {
  const ok = await db.run.updateMany({ where: { id: runId, status: "NEW" }, data: { status: "RESEARCHING" } });
  if (!ok.count) return;
  const run = await db.run.findUniqueOrThrow({ where: { id: runId }, include: { brand: true } });
  const brand = run.brand;
  const avatar = await db.avatar.findUniqueOrThrow({ where: { id: run.avatarId } });
  try {
    await log("research", `Trend-Analyse "${run.niche}" gestartet`, { runId });
    const tags = [...brand.hashtags.split(","), ...(run.niche.length <= 25 ? [run.niche.replace(/\s+/g, "")] : [])].map((t) => t.trim()).filter(Boolean);
    const scraped = await scrapeViral(tags).catch(() => ({ text: "", costUsd: 0 }));
    await track(brand.id, "apify", "Viral-Scraping", scraped.costUsd);

    const research = await researchTrends({ niche: run.niche, brand, scraped: scraped.text });
    await track(brand.id, "anthropic", "Trend-Research", research.costUsd);
    await db.run.update({ where: { id: runId }, data: { research: research.text } });

    const recent = await db.content.findMany({ where: { brandId: brand.id }, orderBy: { createdAt: "desc" }, take: 40, select: { title: true } });
    const { ideas, costUsd } = await generateScripts({
      niche: run.niche, goal: run.goal, research: research.text, brand, avatar, count: run.count,
      recentTitles: recent.map((r) => r.title),
    });
    await track(brand.id, "anthropic", "Scripts", costUsd);

    const baseTags = brand.hashtags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    for (const idea of ideas) {
      const c = await db.content.create({
        data: {
          brandId: brand.id, runId, avatarId: avatar.id,
          status: brand.autoApproveScripts ? "SCRIPT_APPROVED" : "SCRIPT_REVIEW",
          format: idea.format, title: idea.title, trend: idea.trend, hook: idea.hook,
          segments: JSON.stringify(idea.segments), caption: idea.caption,
          hashtags: [...new Set([...idea.hashtags.map((h) => h.replace(/^#/, "")), ...baseTags])].slice(0, 15).join(","),
          platforms: run.platforms,
        },
      });
      await log("script", `Script (${idea.format}, Viral-Score ${idea.viral_score}): ${idea.title}`, { contentId: c.id, runId });
    }
    await db.run.update({ where: { id: runId }, data: { status: "DONE" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.run.update({ where: { id: runId }, data: { status: "FAILED", error: msg } });
    await log("error", `Run fehlgeschlagen: ${msg}`, { runId });
  }
}

// ---------- Schritt 2: Voiceover je Segment + Higgsfield-Jobs starten ----------

/** Zu lange Avatar-Segmente an Satzgrenzen teilen (Speak max 15 s) */
function splitLong(segs: Segment[]): Segment[] {
  return segs.flatMap((s) => {
    const words = s.text.split(/\s+/).length;
    if (s.type !== "avatar" || words <= 32) return [s];
    const sentences = s.text.match(/[^.!?]+[.!?]*/g) ?? [s.text];
    const parts: string[] = [""];
    for (const sen of sentences) {
      if ((parts.at(-1)! + sen).split(/\s+/).length > 30 && parts.at(-1)) parts.push("");
      parts[parts.length - 1] += sen;
    }
    return parts.map((t, i) => ({ ...s, text: t.trim(), onscreen: i ? undefined : s.onscreen }));
  });
}

export async function produce(id: string) {
  if (!(await claim(id, "SCRIPT_APPROVED", "VOICING"))) return;
  const c = await db.content.findUniqueOrThrow({ where: { id }, include: { avatar: true } });
  const { avatar } = c;
  try {
    if (!avatar.imageUrl || !avatar.voiceId) throw new Error(`Avatar ${avatar.name}: Bild oder Voice-ID fehlt`);
    let segs = parseSegments(c.segments);
    if (segs.every((s) => !s.hfRequestId)) segs = splitLong(segs);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.hfRequestId || s.status === "done") continue;

      // Voiceover (feste Stimme, Kontext für natürlichen Fluss)
      if (!s.audioPath) {
        const v = await synthesize(s.text, avatar.voiceId, { previous: segs[i - 1]?.text, next: segs[i + 1]?.text });
        await track(c.brandId, "elevenlabs", "Voiceover", (s.text.length / 1000) * PRICES.elevenPer1kChars, id);
        s.audioPath = await saveFile(`content/${id}`, `seg${i}.mp3`, v.audio);
        s.duration = v.duration;
        s.words = v.words;
        s.audioUrl = cfg.mock ? localUrl(s.audioPath) : await uploadFile(v.audio, "audio/mpeg");
        s.status = "voiced";
        await saveSegs(id, segs);
      }

      if (s.type === "avatar") {
        if (s.duration! > 15) throw new Error(`Segment ${i + 1} zu lang (${s.duration!.toFixed(1)} s > 15 s) – Text kürzen`);
        const bucket = (s.duration! <= 5 ? 5 : s.duration! <= 10 ? 10 : 15) as 5 | 10 | 15;
        s.hfRequestId = await submitSpeak({
          imageUrl: avatar.imageUrl, audioUrl: s.audioUrl!, duration: bucket,
          prompt: `${avatar.motionPrompt}. ${s.visual}`, webhookUrl: hooks(),
        });
        await track(c.brandId, "higgsfield", `Speak ${bucket}s`, bucket * PRICES.hfSpeakPerSec, id);
      } else {
        // B-Roll: Soul-Standbild (Avatar als Referenz für Konsistenz) -> DoP-Video
        if (!s.imageUrl) {
          const img = await waitFor(await submitImage({
            prompt: `${s.visual}, vertical 9:16, cinematic, realistic, no text`,
            referenceUrl: /person|woman|man|she|he |creator|influencer/i.test(s.visual) ? avatar.imageUrl : undefined,
          }));
          s.imageUrl = img.images?.[0]?.url;
          if (!s.imageUrl) throw new Error("Soul lieferte kein Bild");
          await track(c.brandId, "higgsfield", "Soul B-Roll-Bild", PRICES.hfSoulImage, id);
        }
        s.hfRequestId = await submitImageToVideo({ imageUrl: s.imageUrl, prompt: s.visual, webhookUrl: hooks() });
        await track(c.brandId, "higgsfield", "DoP B-Roll", PRICES.hfDop, id);
      }
      s.status = "rendering";
      await saveSegs(id, segs);
    }
    await db.content.update({ where: { id }, data: { status: "RENDERING", error: null } });
    await log("render", `${segs.length} Segmente an Higgsfield übergeben`, { contentId: id });
  } catch (e) {
    await fail(id, "Produktion", e, "SCRIPT_APPROVED");
  }
}

// ---------- Schritt 3: Render-Status aller Segmente prüfen ----------

export async function checkRender(id: string) {
  const c = await db.content.findUniqueOrThrow({ where: { id } });
  if (c.status !== "RENDERING") return;
  const segs = parseSegments(c.segments);
  let changed = false;
  for (const s of segs) {
    if (s.status !== "rendering" || !s.hfRequestId) continue;
    try {
      const r = await getStatus(s.hfRequestId);
      if (r.status === "completed" && r.video?.url) { s.clipUrl = r.video.url; s.status = "done"; changed = true; }
      else if (r.status === "failed" || r.status === "nsfw") {
        // Segment neu anstoßen: Job-ID löschen, zurück in Produktion
        s.hfRequestId = undefined; s.status = "voiced"; changed = true;
        await saveSegs(id, segs);
        if (await claim(id, "RENDERING", "VOICING")) await fail(id, "Rendering", new Error(`Segment-Job ${r.status}`), "SCRIPT_APPROVED");
        return;
      }
    } catch (e) {
      await log("retry", `Status-Abfrage: ${e instanceof Error ? e.message : e}`, { contentId: id });
    }
  }
  if (changed) await saveSegs(id, segs);
  if (segs.length && segs.every((s) => s.status === "done")) await compose(id);
}

// ---------- Schritt 4: Schnitt (ffmpeg) -> fertiges Reel ----------

export async function compose(id: string) {
  if (!(await claim(id, "RENDERING", "COMPOSING"))) return;
  const c = await db.content.findUniqueOrThrow({ where: { id }, include: { brand: true } });
  try {
    const segs = parseSegments(c.segments);
    const dir = await ensureDir(`content/${id}`);
    const withClips = [];
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const clipPath = s.clipUrl!.startsWith("mock://")
        ? await mockClip(path.join(dir, `clip${i}.mp4`), s, i)
        : await download(s.clipUrl!, `content/${id}`, `clip${i}.mp4`);
      withClips.push({ ...s, clipPath });
    }
    const musicPath = cfg.musicUrl ? await download(cfg.musicUrl, "music", "default.mp3").catch(() => undefined) : undefined;
    const out = path.join(dir, "reel.mp4");
    await composeReel({ segments: withClips, workDir: dir, out, musicPath });

    let videoUrl: string;
    if (cfg.mock) videoUrl = localUrl(out);
    else if (cfg.publicBaseUrl) videoUrl = `${cfg.publicBaseUrl}${localUrl(out)}`;
    else videoUrl = await uploadFile(await fs.readFile(out), "video/mp4");

    const next = c.brand.autoApproveVideos ? "VIDEO_APPROVED" : "VIDEO_REVIEW";
    await db.content.update({ where: { id }, data: { videoUrl, status: next, error: null } });
    const secs = segs.reduce((a, s) => a + (s.duration ?? 0), 0);
    await log("video", `Reel fertig (${secs.toFixed(0)} s, ${segs.length} Segmente)`, { contentId: id });
  } catch (e) {
    await db.content.update({ where: { id }, data: { status: "RENDERING" } });
    // Clips sind fertig -> nur Schnitt wiederholen
    const c2 = await db.content.update({ where: { id }, data: { attempts: { increment: 1 }, error: String(e) } });
    if (c2.attempts >= MAX_ATTEMPTS) await db.content.update({ where: { id }, data: { status: "FAILED" } });
    await log("error", `Schnitt: ${e instanceof Error ? e.message : e}`, { contentId: id });
  }
}

// ---------- Schritt 5: In Social Media einplanen ----------

export async function publish(id: string) {
  if (!(await claim(id, "VIDEO_APPROVED", "PUBLISHING"))) return;
  const c = await db.content.findUniqueOrThrow({ where: { id }, include: { brand: true } });
  const b = c.brand;
  try {
    let when = c.scheduledAt;
    if (!when || when.getTime() < Date.now() + 5 * 60 * 1000) {
      const taken = await db.content.findMany({
        where: { brandId: b.id, status: "SCHEDULED", scheduledAt: { gte: new Date() } },
        select: { scheduledAt: true },
      });
      when = nextFreeSlot(taken.map((t) => t.scheduledAt!), b.postSlots.split(",").slice(0, b.postsPerDay), b.timezone);
    }
    const tags = c.hashtags.split(",").filter(Boolean).map((t) => `#${t}`).join(" ");
    const postId = await schedulePost({
      caption: `${c.caption}\n\n${tags}`,
      videoUrl: c.videoUrl!,
      platforms: c.platforms.split(",").map((p) => p.trim()).filter(Boolean),
      scheduledAt: when,
      profileKey: b.ayrshareProfileKey || undefined,
    });
    await db.content.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: when, publishId: postId, error: null } });
    await log("scheduled", `Geplant für ${when.toISOString()} (${c.platforms})`, { contentId: id });
  } catch (e) {
    await fail(id, "Publishing", e, "VIDEO_APPROVED");
  }
}

// ---------- Autopilot: pro Marke immer genug Content im Voraus ----------

export async function autopilot() {
  const brands = await db.brand.findMany({ where: { active: true, autopilot: true }, include: { avatars: true } });
  for (const b of brands) {
    const avatar = b.avatars.find((a) => a.imageUrl && a.voiceId);
    if (!avatar) continue;
    const pendingRun = await db.run.count({ where: { brandId: b.id, status: { in: ["NEW", "RESEARCHING"] } } });
    if (pendingRun) continue;
    const inPipeline = await db.content.count({
      where: {
        brandId: b.id,
        OR: [
          { status: { notIn: ["SCHEDULED", "FAILED", "REJECTED"] } },
          { status: "SCHEDULED", scheduledAt: { gte: new Date() } },
        ],
      },
    });
    const need = b.postsPerDay * b.bufferDays - inPipeline;
    if (need <= 0) continue;
    await db.run.create({
      data: {
        brandId: b.id, avatarId: avatar.id, niche: b.niche || b.name, goal: b.goal,
        platforms: b.platforms, count: Math.min(need, 5), source: "autopilot",
      },
    });
    console.log(`[autopilot] ${b.name}: ${Math.min(need, 5)} neue Reels angestoßen`);
  }
}

// ---------- Avatar-Generierung (Higgsfield Soul, 4 Kandidaten) ----------

export function avatarPrompt(look: string) {
  return `${look}, authentic UGC content creator, selfie portrait, looking directly into the camera, front facing, mouth closed, relaxed natural expression, shot on smartphone, realistic skin texture, soft natural daylight, cozy modern home background, vertical 9:16, upper body visible`;
}

export async function startAvatarGeneration(avatarId: string) {
  const a = await db.avatar.findUniqueOrThrow({ where: { id: avatarId } });
  const requestId = await submitImage({ prompt: avatarPrompt(a.look || a.persona), batch: 4 });
  await db.avatar.update({ where: { id: avatarId }, data: { genRequestId: requestId } });
  await track(a.brandId, "higgsfield", "Avatar-Kandidaten (4)", 4 * PRICES.hfSoulImage);
}

export async function checkAvatars() {
  const list = await db.avatar.findMany({ where: { genRequestId: { not: null } } });
  for (const a of list) {
    try {
      const s = await getStatus(a.genRequestId!);
      if (s.status === "completed") {
        const urls = (s.images ?? []).map((i) => i.url);
        const prev = JSON.parse(a.candidates) as string[];
        await db.avatar.update({ where: { id: a.id }, data: { genRequestId: null, candidates: JSON.stringify([...urls, ...prev].slice(0, 12)) } });
      } else if (s.status === "failed" || s.status === "nsfw") {
        await db.avatar.update({ where: { id: a.id }, data: { genRequestId: null } });
      }
    } catch (e) {
      console.error("[avatar]", e);
    }
  }
}

// ---------- Worker-Tick ----------

export async function tick() {
  await autopilot();
  await checkAvatars();
  const runs = await db.run.findMany({ where: { status: "NEW" }, take: 3 });
  for (const r of runs) await processRun(r.id);

  const [toProduce, rendering, toPublish] = await Promise.all([
    db.content.findMany({ where: { status: "SCRIPT_APPROVED" }, take: 3 }),
    db.content.findMany({ where: { status: "RENDERING" }, take: 20 }),
    db.content.findMany({ where: { status: "VIDEO_APPROVED" }, take: 5 }),
  ]);
  await Promise.all(toProduce.map((c) => produce(c.id)));
  for (const c of rendering) await checkRender(c.id); // seriell: Schnitt ist CPU-lastig
  for (const c of toPublish) await publish(c.id);     // seriell: keine Slot-Kollision
}

// ---------- Dashboard-Aktionen ----------

const TRANSITIONS: Record<string, Record<string, string>> = {
  approve: { SCRIPT_REVIEW: "SCRIPT_APPROVED", VIDEO_REVIEW: "VIDEO_APPROVED" },
  reject: { SCRIPT_REVIEW: "REJECTED", VIDEO_REVIEW: "REJECTED" },
  rerender: { VIDEO_REVIEW: "SCRIPT_REVIEW", FAILED: "SCRIPT_REVIEW", REJECTED: "SCRIPT_REVIEW" },
};

export async function act(id: string, action: "approve" | "reject" | "rerender" | "retry") {
  const c = await db.content.findUniqueOrThrow({ where: { id } });
  let to: string | undefined;
  if (action === "retry") {
    const segs = parseSegments(c.segments);
    to = c.videoUrl ? "VIDEO_APPROVED" : segs.length && segs.every((s) => s.status === "done") ? "RENDERING" : "SCRIPT_APPROVED";
  } else to = TRANSITIONS[action]?.[c.status];
  if (!to) throw new Error(`Aktion ${action} in Status ${c.status} nicht möglich`);
  const data: Record<string, unknown> = { status: to, attempts: 0, error: null };
  if (action === "rerender") {
    data.videoUrl = null;
    data.segments = JSON.stringify(parseSegments(c.segments).map((s) => ({ type: s.type, text: s.text, visual: s.visual, onscreen: s.onscreen, status: "pending" })));
  }
  await db.content.update({ where: { id }, data });
  await log("action", `${action}: ${c.status} → ${to}`, { contentId: id });
}
