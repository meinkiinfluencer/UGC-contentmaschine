import { db } from "@/lib/db";
import { createRun } from "../actions";

export const dynamic = "force-dynamic";

export default async function Runs() {
  const [runs, brands] = await Promise.all([
    db.run.findMany({ orderBy: { createdAt: "desc" }, take: 40, include: { brand: true, _count: { select: { contents: true } } } }),
    db.brand.findMany({ where: { active: true }, include: { avatars: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <meta httpEquiv="refresh" content="20" />
      <h1>Runs – Idee → Trends → Scripts</h1>
      <div className="grid2">
        <form className="panel" action={createRun}>
          <h2>Manueller Run</h2>
          <label>Marke</label>
          <select name="brandId" required>{brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
          <label>Avatar (leer = erster der Marke)</label>
          <select name="avatarId"><option value="">–</option>{brands.flatMap((b) => b.avatars.map((a) => <option key={a.id} value={a.id}>{b.name}: {a.name}</option>))}</select>
          <label>Nische / Thema (leer = Nische der Marke)</label><input name="niche" placeholder="z.B. Black-Friday-Aktion, Wintertrends" />
          <label>Ziel (optional)</label><input name="goal" />
          <label>Anzahl Reels</label><input name="count" type="number" min={1} max={10} defaultValue={3} />
          <label>Plattformen (leer = Marken-Standard)</label>
          <div className="row">
            {["instagram", "tiktok", "facebook"].map((p) => (
              <label key={p} className="chk"><input type="checkbox" name="platforms" value={p} />{p}</label>
            ))}
          </div>
          <div className="row"><button className="p">▶ Run starten</button></div>
          <p className="h">Marken mit ⚡ Autopilot brauchen keine manuellen Runs – der Worker hält automatisch {`postsPerDay × Vorlauf`} Reels in der Pipeline.</p>
        </form>
        <div className="panel">
          <h2>Letzte Runs</h2>
          <table><tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.brand.name}</b> · {r.niche} {r.source === "autopilot" && <span className="pill ok">⚡</span>}
                  <div className="h">{r.createdAt.toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · {r._count.contents} Reels</div>
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
