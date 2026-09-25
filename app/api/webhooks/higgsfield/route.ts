import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkRender } from "@/lib/pipeline";

// Higgsfield ruft diese URL (?hf_webhook=...) nach Abschluss auf.
// Payload wird nicht blind vertraut: Status wird per API gegengeprüft.
export async function POST(req: NextRequest) {
  const contentId = req.nextUrl.searchParams.get("contentId");
  const body = (await req.json().catch(() => ({}))) as { request_id?: string };
  const c = contentId
    ? await db.content.findUnique({ where: { id: contentId } })
    : body.request_id
      ? await db.content.findFirst({ where: { hfRequestId: body.request_id } })
      : null;
  if (!c) return NextResponse.json({ ok: false }, { status: 404 });
  if (body.request_id && c.hfRequestId !== body.request_id) return NextResponse.json({ ok: false }, { status: 409 });
  await checkRender(c.id);
  return NextResponse.json({ ok: true });
}

