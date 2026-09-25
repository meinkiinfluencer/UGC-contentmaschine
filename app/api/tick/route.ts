import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/pipeline";

// Für Serverless-Hosting ohne Dauer-Worker: per Cron (Vercel Cron, n8n, Make) aufrufen.
// Header: Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await tick();
  return NextResponse.json({ ok: true });
}
