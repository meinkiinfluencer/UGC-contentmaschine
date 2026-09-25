"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { act, tick } from "@/lib/pipeline";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function contentAction(id: string, action: "approve" | "reject" | "rerender" | "retry") {
  await act(id, action);
  revalidatePath("/");
  revalidatePath(`/content/${id}`);
}

export async function saveContent(id: string, f: FormData) {
  const scheduledAt = s(f, "scheduledAt");
  await db.content.update({
    where: { id },
    data: {
      title: s(f, "title"), hook: s(f, "hook"), script: s(f, "script"), scene: s(f, "scene"),
      caption: s(f, "caption"), hashtags: s(f, "hashtags").replace(/#/g, ""), platforms: s(f, "platforms"),
      duration: Number(s(f, "duration")) || 15,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
    },
  });
  revalidatePath(`/content/${id}`);
}

export async function bulkApprove(status: string) {
  const items = await db.content.findMany({ where: { status } });
  for (const c of items) await act(c.id, "approve");
  revalidatePath("/");
}

export async function createRun(f: FormData) {
  const brand = await db.brand.findFirst({ include: { avatars: true } });
  if (!brand?.avatars.length) redirect("/settings");
  const platforms = f.getAll("platforms").map(String).join(",") || "instagram,tiktok,facebook";
  await db.run.create({
    data: {
      niche: s(f, "niche"), goal: s(f, "goal"), count: Math.min(Math.max(Number(s(f, "count")) || 3, 1), 10),
      platforms, brandId: brand.id, avatarId: s(f, "avatarId") || brand.avatars[0].id,
    },
  });
  // sofort anstoßen (Worker übernimmt sonst beim nächsten Tick)
  tick().catch(console.error);
  revalidatePath("/runs");
}

export async function saveBrand(f: FormData) {
  const data = {
    name: s(f, "name"), description: s(f, "description"), tone: s(f, "tone"), audience: s(f, "audience"),
    cta: s(f, "cta"), hashtags: s(f, "hashtags"), rules: s(f, "rules"), language: s(f, "language") || "de",
  };
  const id = s(f, "id");
  if (id) await db.brand.update({ where: { id }, data });
  else await db.brand.create({ data });
  revalidatePath("/settings");
}

export async function saveAvatar(f: FormData) {
  const brand = await db.brand.findFirst();
  if (!brand) throw new Error("Erst Marke anlegen");
  const data = {
    name: s(f, "name"), persona: s(f, "persona"), imageUrl: s(f, "imageUrl"), voiceId: s(f, "voiceId"),
    motionPrompt: s(f, "motionPrompt"), brandId: brand.id,
  };
  const id = s(f, "id");
  if (id) await db.avatar.update({ where: { id }, data });
  else await db.avatar.create({ data });
  revalidatePath("/settings");
}
