import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { cfg } from "./config";
import type { Segment } from "./segments";

export const ffmpegPath = () => process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string) || "ffmpeg";

export function run(bin: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}: ${err.slice(-800)}`))));
  });
}

const W = 1080, H = 1920;

/** Platzhalter-Clip für MOCK_MODE */
export async function mockClip(out: string, seg: Segment, i: number) {
  const color = seg.type === "avatar" ? "0x3b2f6b" : "0x1f4d45";
  await run(ffmpegPath(), [
    "-f", "lavfi", "-i", `color=c=${color}:s=${W}x${H}:d=${Math.max(5, Math.ceil(seg.duration ?? 5))}:r=30`,
    "-vf", `drawbox=x=40+mod(t*120\\,900):y=900:w=120:h=120:color=white@0.5:t=fill`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", out,
  ]);
  return out;
}

// ---------- Untertitel (ASS, TikTok-Style: große Wort-Gruppen, aktuelles Wort gelb) ----------

const ts = (s: number) => {
  const cs = Math.max(0, Math.round(s * 100));
  const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), sec = Math.floor((cs % 6000) / 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};
const esc = (t: string) => t.replace(/[{}\\]/g, "").replace(/\n/g, " ");

export function buildAss(segs: Segment[]) {
  const font = cfg.subtitleFont;
  const lines: string[] = [];
  let offset = 0;
  for (const seg of segs) {
    const words = seg.words ?? [];
    for (let i = 0; i < words.length; i += 3) {
      const group = words.slice(i, i + 3);
      const start = offset + group[0].start;
      const end = offset + (words[i + 3]?.start ?? group.at(-1)!.end + 0.15);
      const text = group
        .map((w, j) => {
          const next = group[j + 1]?.start ?? w.end;
          return `{\\k${Math.max(1, Math.round((next - w.start) * 100))}}${esc(w.w.toUpperCase())}`;
        })
        .join(" ");
      lines.push(`Dialogue: 0,${ts(start)},${ts(end)},Sub,,0,0,0,,${text}`);
    }
    if (seg.onscreen) lines.push(`Dialogue: 1,${ts(offset)},${ts(offset + (seg.duration ?? 0))},Title,,0,0,0,,${esc(seg.onscreen.toUpperCase())}`);
    offset += seg.duration ?? 0;
  }
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,${font},86,&H0000E5FF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,2,2,80,80,560,1
Style: Title,${font},64,&H00FFFFFF,&H00FFFFFF,&H00000000,&HB4000000,-1,0,0,0,100,100,0,0,3,18,0,8,80,80,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${lines.join("\n")}
`;
}

/**
 * Schnitt: Segment-Clips (9:16) + Voiceover je Segment -> ein Reel mit
 * Untertiteln, Text-Overlays und optionaler Hintergrundmusik.
 */
export async function composeReel(opts: {
  segments: (Segment & { clipPath: string })[];
  workDir: string;
  out: string;
  musicPath?: string;
}) {
  const { segments, workDir, out, musicPath } = opts;
  const assPath = path.join(workDir, "subs.ass");
  await fs.writeFile(assPath, buildAss(segments));

  const args: string[] = [];
  const f: string[] = [];
  segments.forEach((s, i) => {
    args.push("-stream_loop", "-1", "-i", s.clipPath, "-i", s.audioPath!);
    const d = (s.duration ?? 5).toFixed(3);
    f.push(
      `[${2 * i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30,setsar=1,trim=duration=${d},setpts=PTS-STARTPTS[v${i}]`,
      `[${2 * i + 1}:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[a${i}]`,
    );
  });
  const n = segments.length;
  f.push(`${segments.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${n}:v=1:a=1[vc][ac]`);
  f.push(`[vc]ass=${assPath.replace(/([\\:'])/g, "\\$1")}[vout]`);
  let audioOut = "[ac]";
  if (musicPath) {
    args.push("-stream_loop", "-1", "-i", musicPath);
    f.push(`[${2 * n}:a]volume=0.10,aformat=channel_layouts=stereo[mu]`, `[ac][mu]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[am]`);
    audioOut = "[am]";
  }
  await run(ffmpegPath(), [
    ...args,
    "-filter_complex", f.join(";"),
    "-map", "[vout]", "-map", audioOut,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest",
    out,
  ]);
  return out;
}
