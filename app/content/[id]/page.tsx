import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { label } from "@/lib/status";
import { parseSegments, totalSeconds } from "@/lib/segments";
import { toZonedInput } from "@/lib/slots";
import { contentAction, saveContent } from "../../actions";

export const dynamic = "force-dynamic";


export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.content.findUnique({
    where: { id },
    include: { avatar: true, brand: true, run: true, events: { orderBy: { createdAt: "desc" }, take: 40 } },
  });
  if (!c) notFound();
  const segs = parseSegments(c.segments);
  const words = segs.reduce((a, s) => a + s.text.split(/\s+/).length, 0);
  const editable = ["SCRIPT_REVIEW", "REJECTED", "FAILED"].includes(c.status);

  return (
    <>
      <h1>{c.title} <span className="pill">{label(c.status)}</span> <span className="pill">{c.brand.name}</span></h1>
      {c.error && <p className="err-t">{c.error}</p>}
      <div className="row" style={{ marginBottom: 16 }}>
        {c.status.endsWith("REVIEW") && (
          <>
            <form action={contentAction.bind(null, c.id, "approve")}><button className="ok">✓ Freigeben</button></form>
            <form action={contentAction.bind(null, c.id, "reject")}><button className="err">✕ Ablehnen</button></form>
          </>
        )}
        {["VIDEO_REVIEW", "FAILED", "REJECTED"].includes(c.status) && (
          <form action={contentAction.bind(null, c.id, "rerender")}><button>✎ Zurück zu Script (neu produzieren)</button></form>
        )}
        {c.status === "FAILED" && <form action={contentAction.bind(null, c.id, "retry")}><button>↻ Retry</button></form>}
      </div>
      <div className="grid2">
        <form className="panel" action={saveContent.bind(null, c.id)}>
          <h2>Script – {segs.length} Segmente · {words} Wörter · ≈ {(totalSeconds(segs) || words / 2.5).toFixed(0)} s · Format: {c.format}</h2>
          <label>Titel</label><input name="title" defaultValue={c.title} />
          <p className="h">Trend: {c.trend}</p>
          {segs.map((s, i) => (
            <div key={i} className={`seg ${s.type}`}>
              <div className="row" style={{ marginTop: 0 }}>
                <b>#{i + 1}</b>
                <select name={`seg_${i}_type`} defaultValue={s.type} style={{ width: 140 }} disabled={!editable}>
                  <option value="avatar">🎤 Avatar spricht</option><option value="broll">🎬 B-Roll + VO</option>
                </select>
                {s.status && <span className="pill">{s.status}{s.duration ? ` · ${s.duration.toFixed(1)} s` : ""}</span>}
                {editable && <label className="chk"><input type="checkbox" name={`seg_${i}_del`} />löschen</label>}
              </div>
              <label>Gesprochen</label><textarea name={`seg_${i}_text`} defaultValue={s.text} rows={3} readOnly={!editable} />
              <label>Visual (EN)</label><input name={`seg_${i}_visual`} defaultValue={s.visual} readOnly={!editable} />
              <label>Text-Overlay</label><input name={`seg_${i}_onscreen`} defaultValue={s.onscreen ?? ""} />
              {s.clipUrl && !s.clipUrl.startsWith("mock://") && <a className="h" href={s.clipUrl} target="_blank">▶ Clip</a>}
            </div>
          ))}
          {editable && (
            <div className="seg">
              <b>+ Segment</b>
              <select name="new_type"><option value="avatar">🎤 Avatar spricht</option><option value="broll">🎬 B-Roll + VO</option></select>
              <label>Gesprochen</label><textarea name="new_text" rows={2} />
              <label>Visual (EN)</label><input name="new_visual" />
            </div>
          )}
          <label>Caption</label><textarea name="caption" defaultValue={c.caption} rows={5} />
          <label>Hashtags (kommagetrennt)</label><input name="hashtags" defaultValue={c.hashtags} />
          <label>Plattformen</label><input name="platforms" defaultValue={c.platforms} />
          <label>Geplant für ({c.brand.timezone}, leer = nächster freier Slot der Marke)</label>
          <input type="datetime-local" name="scheduledAt" defaultValue={toZonedInput(c.scheduledAt, c.brand.timezone)} />
          <div className="row"><button className="p">Speichern</button></div>
        </form>
        <div>
          <div className="panel">
            <h2>Reel</h2>
            {c.videoUrl ? <video src={c.videoUrl} controls /> : <p className="h">Noch kein Video.</p>}
            <p className="h">Avatar: {c.avatar.name} · Run: {c.run.niche} · Kosten: ${c.costUsd.toFixed(2)}{c.publishId && ` · Post-ID: ${c.publishId}`}</p>
          </div>
          <div className="panel" style={{ marginTop: 16 }}>
            <h2>Verlauf</h2>
            <table><tbody>
              {c.events.map((e) => (
                <tr key={e.id}>
                  <td className="h">{e.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</td>
                  <td><span className="pill">{e.type}</span></td><td>{e.message}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      </div>
    </>
  );
}
