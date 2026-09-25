// Background-Worker: Autopilot aller Marken + komplette Pipeline, dauerhaft.
// Start: npm run worker   (Produktion: pm2 / Docker / Railway Worker)
import { cfg } from "../src/lib/config";
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

console.log(`[worker] läuft, Intervall ${cfg.workerIntervalSec}s${cfg.mock ? " (MOCK_MODE)" : ""}`);
loop();
setInterval(loop, cfg.workerIntervalSec * 1000);
