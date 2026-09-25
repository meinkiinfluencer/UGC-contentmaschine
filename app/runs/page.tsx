import { db } from "@/lib/db";
import { createRun } from "../actions";

export const dynamic = "force-dynamic";

export default async function Runs() {
  const [runs, avatars] = await Promise.all([
    db.run.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { _count: { select: { contents: true } } } }),
    db.avatar.findMany(),
  ]);
  return (
    <>
      <meta httpEquiv="refresh" content="20" />
      <h1>Runs – Idee → Trends → Scripts</h1>
      <div className="grid2">
        <form className="panel" action={createRun}>
          <h2>Neuer Run</h2>
          <label>Nische</label><input name="niche" required placeholder="z.B. Fitness für Mütter, Immobilienmakler Köln, Skincare" />
          <label>Ziel / Angebot (optional)</label><input name="goal" placeholder="z.B. Leads für kostenloses Erstgespräch" />
          <label>Anzahl Videos</label><input name="count" type="number" min={1} max={10} defaultValue={3} />
          <label>Avatar</label>
          <select name="avatarId">{avatars.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <label>Plattformen</label>
          <div className="row">
            {["instagram", "tiktok", "facebook"].map((p) => (
              <label key={p} style={{ display: "flex", gap: 6, margin: 0 }}>
                <input type="checkbox" name="platforms" value={p} defaultChecked style={{ width: "auto" }} />{p}
              </label>
            ))}
          </div>
          <div className="row"><button className="p">▶ Run starten</button></div>
        </form>
        <div className="panel">
          <h2>Letzte Runs</h2>
          <table><tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.niche}</b><div className="h">{r.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · {r._count.contents} Videos</div>
                  {r.error && <div className="err-t">{r.error}</div>}
                  {r.research && <details><summary className="h">Trend-Analyse</summary><pre>{r.research}</pre></details>}
                </td>
                <td><span className={`pill ${r.status === "DONE" ? "ok" : r.status === "FAILED" ? "err" : "warn"}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
