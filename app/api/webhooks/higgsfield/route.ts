import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkAvatars, checkRender } from "@/lib/pipeline";

// Higgsfield ruft diese URL (?hf_webhook=...) nach Abschluss auf.
// Payload wird nicht blind vertraut: Status wird per API gegengeprüft.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { request_id?: string };
  if (!body.request_id) return NextResponse.json({ ok: false }, { status: 400 });
  const c = await db.content.findFirst({ where: { status: "RENDERING", segments: { contains: body.request_id } } });
  if (c) await checkRender(c.id);
  else await checkAvatars();
  return NextResponse.json({ ok: true });
}
