import { db } from "@/lib/db";
import { PRICES } from "@/lib/costs";

export const dynamic = "force-dynamic";

export default async function Costs() {
  const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [byBrand, byProvider, brands, reels] = await Promise.all([
    db.cost.groupBy({ by: ["brandId"], where: { createdAt: { gte: month } }, _sum: { usd: true } }),
    db.cost.groupBy({ by: ["provider", "item"], where: { createdAt: { gte: month } }, _sum: { usd: true }, _count: true }),
    db.brand.findMany(),
    db.content.findMany({ where: { videoUrl: { not: null }, createdAt: { gte: month } }, select: { brandId: true, costUsd: true } }),
  ]);
  const total = byBrand.reduce((a, b) => a + (b._sum.usd ?? 0), 0);
  return (
    <>
      <h1>Kosten – {month.toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</h1>
      <div className="stats">
        <div className="stat"><b>${total.toFixed(2)}</b>variable Kosten</div>
        <div className="stat"><b>{reels.length}</b>fertige Reels</div>
        <div className="stat"><b>${reels.length ? (reels.reduce((a, r) => a + r.costUsd, 0) / reels.length).toFixed(2) : "–"}</b>Ø pro Reel</div>
      </div>
      <div className="grid2">
        <div className="panel">
          <h2>Pro Marke</h2>
          <table><tbody>
            {byBrand.map((b) => {
              const r = reels.filter((x) => x.brandId === b.brandId);
              return (
                <tr key={b.brandId}>
                  <td>{brands.find((x) => x.id === b.brandId)?.name}</td>
                  <td>${(b._sum.usd ?? 0).toFixed(2)}</td>
                  <td className="h">{r.length} Reels · Ø ${r.length ? (r.reduce((a, x) => a + x.costUsd, 0) / r.length).toFixed(2) : "–"}</td>
                </tr>
              );
            })}
          </tbody></table>
        </div>
        <div className="panel">
          <h2>Pro Anbieter / Posten</h2>
          <table><tbody>
            {byProvider.sort((a, b) => (b._sum.usd ?? 0) - (a._sum.usd ?? 0)).map((p) => (
              <tr key={p.provider + p.item}><td>{p.provider}</td><td>{p.item}</td><td>{p._count}×</td><td>${(p._sum.usd ?? 0).toFixed(2)}</td></tr>
            ))}
          </tbody></table>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <h2>Preis-Annahmen (in .env überschreibbar)</h2>
        <p className="h">Claude: ${PRICES.claudeInPerM}/${PRICES.claudeOutPerM} je 1M Tokens (Input/Output) · Websuche ${PRICES.webSearch}/Suche · ElevenLabs ${PRICES.elevenPer1kChars}/1k Zeichen · Higgsfield Speak ${PRICES.hfSpeakPerSec}/s · Soul ${PRICES.hfSoulImage}/Bild · DoP ${PRICES.hfDop}/Clip · Apify ${PRICES.apifyPer1k}/1k Ergebnisse.
          Higgsfield-Werte sind Schätzungen – nach den ersten Reels mit dem Credit-Verbrauch im Higgsfield-Dashboard abgleichen.
          Fixkosten (nicht erfasst): Ayrshare, ElevenLabs-Abo, Hosting.</p>
      </div>
    </>
  );
}
