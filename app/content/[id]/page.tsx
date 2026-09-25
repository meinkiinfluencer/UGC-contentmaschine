import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { label } from "@/lib/status";
import { contentAction, saveContent } from "../../actions";

export const dynamic = "force-dynamic";

const toLocalInput = (d: Date | null) =>
  d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.content.findUnique({
    where: { id },
    include: { avatar: true, run: true, events: { orderBy: { createdAt: "desc" }, take: 30 } },
  });
  if (!c) notFound();
  const words = c.script.split(/\s+/).filter(Boolean).length;

  return (
    <>
      <h1>{c.title} <span className="pill">{label(c.status)}</span></h1>
      {c.error && <p className="err-t">{c.error}</p>}
      <div className="row" style={{ marginBottom: 16 }}>
        {c.status.endsWith("REVIEW") && (
          <>
            <form action={contentAction.bind(null, c.id, "approve")}><button className="ok">✓ Freigeben</button></form>
            <form action={contentAction.bind(null, c.id, "reject")}><button className="err">✕ Ablehnen</button></form>
          </>
        )}
        {["VIDEO_REVIEW", "FAILED", "REJECTED"].includes(c.status) && (
          <form action={contentAction.bind(null, c.id, "rerender")}><button>↻ Neu rendern / zurück zu Script</button></form>
        )}
        {c.status === "FAILED" && <form action={contentAction.bind(null, c.id, "retry")}><button>↻ Retry</button></form>}
      </div>
      <div className="grid2">
        <form className="panel" action={saveContent.bind(null, c.id)}>
          <h2>Script & Post</h2>
          <label>Titel</label><input name="title" defaultValue={c.title} />
          <label>Trend</label><input disabled defaultValue={c.trend} />
          <label>Hook</label><input name="hook" defaultValue={c.hook} />
          <label>Script (gesprochen) – {words} Wörter</label><textarea name="script" defaultValue={c.script} rows={6} />
          <label>Dauer (Sek.)</label>
          <select name="duration" defaultValue={String(c.duration)}>
            <option>5</option><option>10</option><option>15</option>
          </select>
          <label>Szene / Motion-Prompt (EN)</label><textarea name="scene" defaultValue={c.scene} />
          <label>Caption</label><textarea name="caption" defaultValue={c.caption} />
          <label>Hashtags (kommagetrennt)</label><input name="hashtags" defaultValue={c.hashtags} />
          <label>Plattformen</label><input name="platforms" defaultValue={c.platforms} />
          <label>Geplant für (leer = nächster freier Slot)</label>
          <input type="datetime-local" name="scheduledAt" defaultValue={toLocalInput(c.scheduledAt)} />
          <div className="row"><button className="p">Speichern</button></div>
        </form>
        <div>
          <div className="panel">
            <h2>Video</h2>
            {c.videoUrl ? <video src={c.videoUrl} controls /> : <p className="h">Noch kein Video.</p>}
            {c.audioUrl && <><label>Voiceover</label><audio src={c.audioUrl} controls style={{ width: "100%" }} /></>}
            <p className="h">Avatar: {c.avatar.name} · Run: {c.run.niche}{c.publishId && ` · Post-ID: ${c.publishId}`}</p>
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
