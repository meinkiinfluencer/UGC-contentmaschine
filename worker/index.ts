// Background-Worker: arbeitet die Pipeline dauerhaft ab + optionale Auto-Runs per Cron.
// Start: npm run worker   (Produktion: pm2 / Docker / Railway Worker)
import cron from "node-cron";
import { cfg } from "../src/lib/config";
import { db } from "../src/lib/db";
import { tick } from "../src/lib/pipeline";

let busy = false;
async function loop() {
  if (busy) return;
  busy = true;
  try {
    await tick();
  } catch (e) {
    console.error("[worker] tick error", e);
  } finally {
    busy = false;
  }
}

if (cfg.autoRunCron && cfg.autoRunNiche) {
  cron.schedule(
    cfg.autoRunCron,
    async () => {
      const brand = await db.brand.findFirst({ include: { avatars: true } });
      if (!brand?.avatars[0]) return console.warn("[worker] Auto-Run: keine Marke/Avatar angelegt");
      await db.run.create({ data: { niche: cfg.autoRunNiche, brandId: brand.id, avatarId: brand.avatars[0].id } });
      console.log(`[worker] Auto-Run angelegt: ${cfg.autoRunNiche}`);
    },
    { timezone: cfg.timezone },
  );
  console.log(`[worker] Auto-Run aktiv: "${cfg.autoRunCron}" → ${cfg.autoRunNiche}`);
}

console.log(`[worker] läuft, Intervall ${cfg.workerIntervalSec}s${cfg.mock ? " (MOCK_MODE)" : ""}`);
loop();
setInterval(loop, cfg.workerIntervalSec * 1000);
