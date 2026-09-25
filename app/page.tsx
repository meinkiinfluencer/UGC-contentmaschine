import Link from "next/link";
import { db } from "@/lib/db";
import { BOARD, label } from "@/lib/status";
import { parseSegments, totalSeconds } from "@/lib/segments";
import { postText } from "@/lib/pipeline";
import CopyButton from "./components/CopyButton";
import { bulkApprove, contentAction } from "./actions";

export const dynamic = "force-dynamic";

const pillClass = (s: string) =>
  s.endsWith("REVIEW") || s === "READY" ? "warn" : s === "SCHEDULED" || s === "POSTED" ? "ok" : s === "FAILED" || s === "REJECTED" ? "err" : "";

export default async function Board({ searchParams }: { searchParams: Promise<{ brand?: string }> }) {
  const brandId = (await searchParams).brand ?? "";
  const [brands, items] = await Promise.all([
    db.brand.findMany({ orderBy: { name: "asc" } }),
    db.content.findMany({ where: brandId ? { brandId } : {}, orderBy: { updatedAt: "desc" }, take: 400, include: { brand: true } }),
  ]);
  const count = (...st: string[]) => items.filter((i) => st.includes(i.status)).length;

  return (
    <>
      <meta httpEquiv="refresh" content="30" />
      <h1>Pipeline</h1>
      <div className="filters">
        <Link href="/" className={!brandId ? "on" : ""}>Alle Marken</Link>
        {brands.map((b) => <Link key={b.id} href={`/?brand=${b.id}`} className={brandId === b.id ? "on" : ""}>{b.name}{b.autopilot ? " ⚡" : ""}</Link>)}
      </div>
      <div className="stats">
        <div className="stat"><b>{count("SCRIPT_REVIEW")}</b>Scripts warten</div>
        <div className="stat"><b>{count("SCRIPT_APPROVED", "VOICING", "RENDERING", "COMPOSING")}</b>in Produktion</div>
        <div className="stat"><b>{count("VIDEO_REVIEW")}</b>Videos warten</div>
        <div className="stat"><b>{count("READY")}</b>fertig zum Posten</div>
        <div className="stat"><b>{count("POSTED", "SCHEDULED")}</b>gepostet</div>
        <div className="stat"><b>{count("FAILED")}</b>Fehler</div>
      </div>
      <div className="board">
        {BOARD.map((col) => {
          const list = items.filter((i) => col.statuses.includes(i.status));
          const gate = col.statuses.length === 1 && col.statuses[0].endsWith("REVIEW") ? col.statuses[0] : null;
          return (
            <section className="col" key={col.title}>
              <h2>{col.title}<span>{list.length}</span></h2>
              {gate && list.length > 1 && (
                <form action={bulkApprove.bind(null, gate, brandId)} style={{ marginBottom: 8 }}>
                  <button className="ok" style={{ width: "100%" }}>Alle freigeben ({list.length})</button>
                </form>
              )}
              {list.map((c) => {
                const segs = parseSegments(c.segments);
                const secs = totalSeconds(segs);
                return (
                  <div className="card" key={c.id}>
                    <Link href={`/content/${c.id}`}>
                      <div className="h" style={{ fontSize: 11 }}>{c.brand.name} · {c.format}</div>
                      <div className="t">{c.title}</div>
                      <div className="h">„{c.hook}“</div>
                    </Link>
                    {["VIDEO_REVIEW", "READY"].includes(c.status) && c.videoUrl && (
                      <video src={c.videoUrl} controls preload="metadata" style={{ marginTop: 8, maxHeight: 280 }} />
                    )}
                    <div className="row">
                      <span className={`pill ${pillClass(c.status)}`}>{label(c.status)}</span>
                      <span className="pill">{segs.length} Seg.{secs ? ` · ${secs.toFixed(0)} s` : ""}</span>
                      {c.costUsd > 0 && <span className="pill">${c.costUsd.toFixed(2)}</span>}
                      {c.scheduledAt && c.status !== "POSTED" && <span className="pill">{c.status === "READY" ? "📅 " : ""}{c.scheduledAt.toLocaleString("de-DE", { timeZone: c.brand.timezone, dateStyle: "short", timeStyle: "short" })}</span>}
                    </div>
                    {c.error && <div className="err-t">{c.error.slice(0, 140)}</div>}
                    {c.status.endsWith("REVIEW") && (
                      <div className="row">
                        <form action={contentAction.bind(null, c.id, "approve")}><button className="ok">✓ Freigeben</button></form>
                        <form action={contentAction.bind(null, c.id, "reject")}><button className="err">✕</button></form>
                      </div>
                    )}
                    {c.status === "READY" && (
                      <div className="row">
                        <a className="btn" href={`${c.videoUrl}?download=${encodeURIComponent(c.title.slice(0, 40))}`}>⬇ Reel</a>
                        <CopyButton text={postText(c)} label="📋 Caption" />
                        <form action={contentAction.bind(null, c.id, "posted")}><button className="ok">✓ Gepostet</button></form>
                      </div>
                    )}
                    {c.status === "FAILED" && (
                      <div className="row"><form action={contentAction.bind(null, c.id, "retry")}><button>↻ Retry</button></form></div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </>
  );
}
