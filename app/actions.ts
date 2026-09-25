"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { act, startAvatarGeneration, tick } from "@/lib/pipeline";
import { parseSegments, type Segment } from "@/lib/segments";
import { fromZonedInput } from "@/lib/slots";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const b = (f: FormData, k: string) => f.get(k) === "on";
const n = (f: FormData, k: string, d: number) => Number(s(f, k)) || d;

export async function contentAction(id: string, action: "approve" | "reject" | "rerender" | "retry") {
  await act(id, action);
  revalidatePath("/");
  revalidatePath(`/content/${id}`);
}

export async function saveContent(id: string, f: FormData) {
  const content = await db.content.findUniqueOrThrow({ where: { id }, include: { brand: true } });
  const old = parseSegments(content.segments);
  const segs: Segment[] = [];
  for (let i = 0; i < 20; i++) {
    const text = s(f, `seg_${i}_text`);
    if (!f.has(`seg_${i}_text`)) break;
    if (!text || b(f, `seg_${i}_del`)) continue;
    const prev = old[i];
    const type = f.has(`seg_${i}_type`) ? (s(f, `seg_${i}_type`) === "broll" ? "broll" : "avatar") : prev?.type ?? "avatar";
    const visual = s(f, `seg_${i}_visual`);
    const onscreen = s(f, `seg_${i}_onscreen`) || undefined;
    const unchanged = prev && prev.text === text && prev.type === type && prev.visual === visual;
    segs.push(unchanged ? { ...prev, onscreen } : { type, text, visual, onscreen, status: "pending" });
  }
  if (s(f, "new_text")) segs.push({ type: s(f, "new_type") === "broll" ? "broll" : "avatar", text: s(f, "new_text"), visual: s(f, "new_visual"), status: "pending" });
  const scheduledAt = s(f, "scheduledAt");
  await db.content.update({
    where: { id },
    data: {
      title: s(f, "title"), hook: segs[0]?.text.split(/[.!?]/)[0] ?? "", segments: JSON.stringify(segs),
      caption: s(f, "caption"), hashtags: s(f, "hashtags").replace(/#/g, ""), platforms: s(f, "platforms"),
      scheduledAt: scheduledAt ? fromZonedInput(scheduledAt, content.brand.timezone) : null,
    },
  });
  revalidatePath(`/content/${id}`);
}

export async function bulkApprove(status: string, brandId: string) {
  const items = await db.content.findMany({ where: { status, ...(brandId ? { brandId } : {}) } });
  for (const c of items) await act(c.id, "approve");
  revalidatePath("/");
}

export async function createRun(f: FormData) {
  const brand = await db.brand.findUniqueOrThrow({ where: { id: s(f, "brandId") }, include: { avatars: true } });
  const avatar = brand.avatars.find((a) => a.id === s(f, "avatarId")) ?? brand.avatars[0];
  if (!avatar) redirect(`/brands/${brand.id}`);
  const platforms = f.getAll("platforms").map(String).join(",") || brand.platforms;
  await db.run.create({
    data: {
      brandId: brand.id, avatarId: avatar.id, niche: s(f, "niche") || brand.niche || brand.name,
      goal: s(f, "goal") || brand.goal, count: Math.min(Math.max(n(f, "count", 3), 1), 10), platforms,
    },
  });
  tick().catch(console.error); // sofort anstoßen
  revalidatePath("/runs");
}

export async function saveBrand(f: FormData) {
  const data = {
    name: s(f, "name"), description: s(f, "description"), tone: s(f, "tone"), audience: s(f, "audience"),
    cta: s(f, "cta"), hashtags: s(f, "hashtags"), rules: s(f, "rules"), language: s(f, "language") || "de",
    niche: s(f, "niche"), goal: s(f, "goal"), pillars: s(f, "pillars"),
    formats: f.getAll("formats").map(String).join(","), targetSeconds: n(f, "targetSeconds", 40),
    active: b(f, "active"), autopilot: b(f, "autopilot"), postsPerDay: n(f, "postsPerDay", 1),
    postSlots: s(f, "postSlots") || "18:00", timezone: s(f, "timezone") || "Europe/Berlin", bufferDays: n(f, "bufferDays", 3),
    autoApproveScripts: b(f, "autoApproveScripts"), autoApproveVideos: b(f, "autoApproveVideos"),
    platforms: f.getAll("platforms").map(String).join(",") || "instagram,tiktok,facebook",
    ayrshareProfileKey: s(f, "ayrshareProfileKey"),
  };
  const id = s(f, "id");
  const brand = id ? await db.brand.update({ where: { id }, data }) : await db.brand.create({ data });
  revalidatePath("/brands");
  redirect(`/brands/${brand.id}`);
}

export async function saveAvatar(f: FormData) {
  const data = {
    name: s(f, "name"), persona: s(f, "persona"), look: s(f, "look"), imageUrl: s(f, "imageUrl"),
    voiceId: s(f, "voiceId"), motionPrompt: s(f, "motionPrompt"),
  };
  const id = s(f, "id");
  const avatar = id
    ? await db.avatar.update({ where: { id }, data })
    : await db.avatar.create({ data: { ...data, brandId: s(f, "brandId") } });
  if (b(f, "generate")) await startAvatarGeneration(avatar.id);
  revalidatePath(`/brands/${avatar.brandId}`);
}

export async function generateAvatar(avatarId: string) {
  const a = await startAvatarGeneration(avatarId).then(() => db.avatar.findUniqueOrThrow({ where: { id: avatarId } }));
  revalidatePath(`/brands/${a.brandId}`);
}

export async function pickAvatarImage(avatarId: string, url: string) {
  const a = await db.avatar.update({ where: { id: avatarId }, data: { imageUrl: url } });
  revalidatePath(`/brands/${a.brandId}`);
}
