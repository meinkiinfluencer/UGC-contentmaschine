import fs from "node:fs/promises";
import path from "node:path";

// Lokaler Arbeits-/Medienordner. Produktion: Volume mounten oder auf S3/Supabase Storage umstellen.
export const MEDIA_DIR = path.resolve(process.env.MEDIA_DIR || "./data/media");

export async function ensureDir(sub = "") {
  const dir = path.join(MEDIA_DIR, sub);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function saveFile(sub: string, name: string, data: ArrayBuffer | Buffer) {
  const dir = await ensureDir(sub);
  const p = path.join(dir, name);
  await fs.writeFile(p, Buffer.isBuffer(data) ? data : Buffer.from(data));
  return p;
}

export async function download(url: string, sub: string, name: string) {
  if (url.startsWith("/api/media/")) return path.join(MEDIA_DIR, decodeURIComponent(url.slice("/api/media/".length)));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${res.status}: ${url}`);
  return saveFile(sub, name, await res.arrayBuffer());
}

/** Dashboard-URL einer lokalen Datei */
export const localUrl = (absPath: string) => `/api/media/${path.relative(MEDIA_DIR, absPath).split(path.sep).map(encodeURIComponent).join("/")}`;
