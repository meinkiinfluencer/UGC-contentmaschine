import Link from "next/link";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Brands() {
  const month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const brands = await db.brand.findMany({
    orderBy: { name: "asc" },
    include: { avatars: true, _count: { select: { contents: { where: { status: "SCHEDULED" } } } } },
  });
  const costs = await db.cost.groupBy({ by: ["brandId"], where: { createdAt: { gte: month } }, _sum: { usd: true } });
  return (
    <>
      <h1>Marken / Kunden</h1>
      <div className="row" style={{ marginBottom: 16 }}><Link className="btn" href="/brands/new">+ Neue Marke</Link></div>
      <div className="grid3">
        {brands.map((b) => (
          <Link key={b.id} href={`/brands/${b.id}`} className="panel">
            <h2>{b.name} {b.autopilot ? <span className="pill ok">⚡ Autopilot</span> : <span className="pill">manuell</span>} {!b.active && <span className="pill err">pausiert</span>}</h2>
            <div className="h">{b.niche || b.description.slice(0, 80)}</div>
            <div className="row">
              <span className="pill">{b.postsPerDay}/Tag · {b.postSlots}</span>
              <span className="pill">{b.avatars.length} Avatar(e)</span>
              <span className="pill">{b._count.contents} geplant</span>
              <span className="pill">${(costs.find((c) => c.brandId === b.id)?._sum.usd ?? 0).toFixed(2)} diesen Monat</span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
