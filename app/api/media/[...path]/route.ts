import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { MEDIA_DIR } from "@/lib/storage";

const TYPES: Record<string, string> = { ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg" };

// Liefert gerenderte Reels/Audios aus (öffentlich, damit Ayrshare sie abholen kann)
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.map(decodeURIComponent).join("/");
  const file = path.resolve(MEDIA_DIR, rel);
  if (!file.startsWith(MEDIA_DIR + path.sep)) return new NextResponse("forbidden", { status: 403 });
  try {
    const data = await fs.readFile(file);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=86400",
        ...(req.nextUrl.searchParams.get("download")
          ? { "Content-Disposition": `attachment; filename="${req.nextUrl.searchParams.get("download")!.replace(/[^\w.-]/g, "_")}.mp4"` }
          : {}),
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
