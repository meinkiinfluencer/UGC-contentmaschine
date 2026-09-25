import { db, log } from "./db";
import { cfg } from "./config";
import { researchTrends, generateScripts } from "./llm";
import { synthesize } from "./tts";
import { uploadFile, submitSpeakVideo, getStatus } from "./higgsfield";
import { schedulePost } from "./publisher";
import { nextFreeSlot } from "./slots";

const MAX_ATTEMPTS = 3;

/** Atomar Status wechseln – verhindert Doppelverarbeitung bei mehreren Workern */
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

// ---------- Schritt 1: Run -> Research -> Scripts ----------

export async function processRun(runId: string) {
  const ok = await db.run.updateMany({ where: { id: runId, status: "NEW" }, data: { status: "RESEARCHING" } });
  if (!ok.count) return;
  const run = await db.run.findUniqueOrThrow({ where: { id: runId }, include: { brand: true } });
  const avatar = await db.avatar.findUniqueOrThrow({ where: { id: run.avatarId } });
  try {
    await log("research", `Trend-Analyse für "${run.niche}" gestartet`, { runId });
    const research = await researchTrends(run.niche, run.brand, run.platforms);
    await db.run.update({ where: { id: runId }, data: { research } });

    const ideas = await generateScripts({
      niche: run.niche, goal: run.goal, research, brand: run.brand, avatar, count: run.count,
    });
    const baseTags = run.brand.hashtags.split(",").map((t) => t.trim().replace(/^#/, "")).filter(Boolean);
    for (const idea of ideas) {
      const c = await db.content.create({
        data: {
          runId, avatarId: avatar.id,
          status: cfg.autoApproveScripts ? "SCRIPT_APPROVED" : "SCRIPT_REVIEW",
          title: idea.title, trend: idea.trend, hook: idea.hook, script: idea.script,
          scene: idea.scene, caption: idea.caption, duration: idea.duration,
          hashtags: [...new Set([...idea.hashtags.map((h) => h.replace(/^#/, "")), ...baseTags])].join(","),
          platforms: run.platforms,
        },
      });
      await log("script", `Script erstellt: ${idea.title}`, { contentId: c.id, runId });
    }
    await db.run.update({ where: { id: runId }, data: { status: "DONE" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.run.update({ where: { id: runId }, data: { status: "FAILED", error: msg } });
    await log("error", `Run fehlgeschlagen: ${msg}`, { runId });
  }
}

// ---------- Schritt 2: Voiceover + Video-Rendering starten ----------

export async function produce(id: string) {
  if (!(await claim(id, "SCRIPT_APPROVED", "VOICING"))) return;
  const c = await db.content.findUniqueOrThrow({ where: { id }, include: { avatar: true } });
  try {
    const audio = await synthesize(c.script, c.avatar.voiceId);
    const audioUrl = await uploadFile(audio, "audio/mpeg");
    const duration = ([5, 10, 15].includes(c.duration) ? c.duration : 15) as 5 | 10 | 15;
    const requestId = await submitSpeakVideo({
      imageUrl: c.avatar.imageUrl,
      audioUrl,
      prompt: `${c.avatar.motionPrompt}. ${c.scene}`,
      duration,
      webhookUrl: cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/api/webhooks/higgsfield?contentId=${id}` : undefined,
    });
    await db.content.update({ where: { id }, data: { audioUrl, hfRequestId: requestId, status: "RENDERING", error: null } });
    await log("render", `Higgsfield-Job gestartet (${requestId})`, { contentId: id });
  } catch (e) {
    await fail(id, "Produktion", e, "SCRIPT_APPROVED");
  }
}

// ---------- Schritt 3: Render-Status prüfen ----------

export async function checkRender(id: string) {
  const c = await db.content.findUniqueOrThrow({ where: { id } });
  if (c.status !== "RENDERING" || !c.hfRequestId) return;
  try {
    const s = await getStatus(c.hfRequestId);
    await applyRenderResult(id, s.status, s.video?.url);
  } catch (e) {
    await log("retry", `Status-Abfrage: ${e instanceof Error ? e.message : e}`, { contentId: id });
  }
}

export async function applyRenderResult(id: string, status: string, videoUrl?: string) {
  if (status === "completed" && videoUrl) {
    const next = cfg.autoApproveVideos ? "VIDEO_APPROVED" : "VIDEO_REVIEW";
    const r = await db.content.updateMany({ where: { id, status: "RENDERING" }, data: { videoUrl, status: next } });
    if (r.count) await log("video", "Video fertig", { contentId: id });
  } else if (status === "failed" || status === "nsfw") {
    if (await claim(id, "RENDERING", "VOICING")) {
      await fail(id, "Rendering", new Error(`Higgsfield-Status: ${status}`), "SCRIPT_APPROVED");
    }
  }
}

// ---------- Schritt 4: In Social Media einplanen ----------

export async function publish(id: string) {
  if (!(await claim(id, "VIDEO_APPROVED", "PUBLISHING"))) return;
  const c = await db.content.findUniqueOrThrow({ where: { id } });
  try {
    let when = c.scheduledAt;
    if (!when || when.getTime() < Date.now() + 5 * 60 * 1000) {
      const taken = await db.content.findMany({
        where: { status: "SCHEDULED", scheduledAt: { gte: new Date() } },
        select: { scheduledAt: true },
      });
      when = nextFreeSlot(taken.map((t) => t.scheduledAt!).filter(Boolean));
    }
    const tags = c.hashtags.split(",").filter(Boolean).map((t) => `#${t}`).join(" ");
    const postId = await schedulePost({
      caption: `${c.caption}\n\n${tags}`,
      videoUrl: c.videoUrl!,
      platforms: c.platforms.split(",").map((p) => p.trim()).filter(Boolean),
      scheduledAt: when,
    });
    await db.content.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: when, publishId: postId, error: null } });
    await log("scheduled", `Geplant für ${when.toISOString()} (${c.platforms})`, { contentId: id });
  } catch (e) {
    await fail(id, "Publishing", e, "VIDEO_APPROVED");
  }
}

// ---------- Worker-Tick: alles abarbeiten, was ansteht ----------

export async function tick() {
  const runs = await db.run.findMany({ where: { status: "NEW" }, take: 3 });
  for (const r of runs) await processRun(r.id);

  const [toProduce, rendering, toPublish] = await Promise.all([
    db.content.findMany({ where: { status: "SCRIPT_APPROVED" }, take: 5 }),
    db.content.findMany({ where: { status: "RENDERING" }, take: 20 }),
    db.content.findMany({ where: { status: "VIDEO_APPROVED" }, take: 5 }),
  ]);
  await Promise.all(toProduce.map((c) => produce(c.id)));
  await Promise.all(rendering.map((c) => checkRender(c.id)));
  for (const c of toPublish) await publish(c.id); // seriell -> keine Slot-Kollision
}

// ---------- Dashboard-Aktionen ----------

const TRANSITIONS: Record<string, Record<string, string>> = {
  approve: { SCRIPT_REVIEW: "SCRIPT_APPROVED", VIDEO_REVIEW: "VIDEO_APPROVED" },
  reject: { SCRIPT_REVIEW: "REJECTED", VIDEO_REVIEW: "REJECTED" },
  // neu rendern mit (ggf. geändertem) Script
  rerender: { VIDEO_REVIEW: "SCRIPT_APPROVED", FAILED: "SCRIPT_APPROVED", REJECTED: "SCRIPT_REVIEW" },
};

export async function act(id: string, action: "approve" | "reject" | "rerender" | "retry") {
  const c = await db.content.findUniqueOrThrow({ where: { id } });
  let to: string | undefined;
  if (action === "retry") to = c.videoUrl ? "VIDEO_APPROVED" : "SCRIPT_APPROVED";
  else to = TRANSITIONS[action]?.[c.status];
  if (!to) throw new Error(`Aktion ${action} in Status ${c.status} nicht möglich`);
  const reset = action === "rerender" || (action === "retry" && !c.videoUrl) ? { videoUrl: null, hfRequestId: null } : {};
  await db.content.update({ where: { id }, data: { status: to, attempts: 0, error: null, ...reset } });
  await log("action", `${action}: ${c.status} → ${to}`, { contentId: id });
}
