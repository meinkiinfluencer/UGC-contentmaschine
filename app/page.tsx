import Link from "next/link";
import { db } from "@/lib/db";
import { BOARD, label } from "@/lib/status";
import { bulkApprove, contentAction } from "./actions";

export const dynamic = "force-dynamic";

const pillClass = (s: string) =>
  s.endsWith("REVIEW") ? "warn" : s === "SCHEDULED" ? "ok" : s === "FAILED" || s === "REJECTED" ? "err" : "";

export default async function Board() {
  const items = await db.content.findMany({ orderBy: { updatedAt: "desc" }, take: 300 });
  const count = (st: string) => items.filter((i) => i.status === st).length;

  return (
    <>
      <meta httpEquiv="refresh" content="30" />
      <h1>Pipeline</h1>
      <div className="stats">
        <div className="stat"><b>{count("SCRIPT_REVIEW")}</b>Scripts warten</div>
        <div className="stat"><b>{count("RENDERING") + count("VOICING") + count("SCRIPT_APPROVED")}</b>in Produktion</div>
        <div className="stat"><b>{count("VIDEO_REVIEW")}</b>Videos warten</div>
        <div className="stat"><b>{count("SCHEDULED")}</b>geplant</div>
        <div className="stat"><b>{count("FAILED")}</b>Fehler</div>
      </div>
      <div className="board">
        {BOARD.map((col) => {
          const list = items.filter((i) => (col.statuses as readonly string[]).includes(i.status));
          const gate = col.statuses.length === 1 && col.statuses[0].endsWith("REVIEW") ? col.statuses[0] : null;
          return (
            <section className="col" key={col.title}>
              <h2>{col.title}<span>{list.length}</span></h2>
              {gate && list.length > 1 && (
                <form action={bulkApprove.bind(null, gate)} style={{ marginBottom: 8 }}>
                  <button className="ok" style={{ width: "100%" }}>Alle freigeben ({list.length})</button>
                </form>
              )}
              {list.map((c) => (
                <div className="card" key={c.id}>
                  <Link href={`/content/${c.id}`}>
                    <div className="t">{c.title}</div>
                    <div className="h">„{c.hook}“</div>
                  </Link>
                  {c.status === "VIDEO_REVIEW" && c.videoUrl && (
                    <video src={c.videoUrl} controls preload="metadata" style={{ marginTop: 8, maxHeight: 280 }} />
                  )}
                  <div className="row">
                    <span className={`pill ${pillClass(c.status)}`}>{label(c.status)}</span>
                    {c.scheduledAt && <span className="pill">{c.scheduledAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</span>}
                  </div>
                  {c.error && <div className="err-t">{c.error.slice(0, 140)}</div>}
                  {c.status.endsWith("REVIEW") && (
                    <div className="row">
                      <form action={contentAction.bind(null, c.id, "approve")}><button className="ok">✓ Freigeben</button></form>
                      <form action={contentAction.bind(null, c.id, "reject")}><button className="err">✕</button></form>
                      {c.status === "VIDEO_REVIEW" && (
                        <form action={contentAction.bind(null, c.id, "rerender")}><button>↻ Neu</button></form>
                      )}
                    </div>
                  )}
                  {c.status === "FAILED" && (
                    <div className="row"><form action={contentAction.bind(null, c.id, "retry")}><button>↻ Retry</button></form></div>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </>
  );
}
