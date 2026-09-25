import { cfg } from "./config";

/** Offset (ms) einer Zeitzone zu UTC für einen Zeitpunkt */
function tzOffset(date: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function zoned(y: number, m: number, d: number, h: number, min: number, tz: string): Date {
  const guess = Date.UTC(y, m, d, h, min);
  return new Date(guess - tzOffset(new Date(guess), tz));
}

/** Nächster freier Posting-Slot (min. 20 Min in der Zukunft), belegte Slots überspringen */
export function nextFreeSlot(taken: Date[], now = new Date()): Date {
  const tz = cfg.timezone;
  const takenSet = new Set(taken.map((t) => t.getTime()));
  const minTime = now.getTime() + 20 * 60 * 1000;
  const localToday = new Date(now.getTime() + tzOffset(now, tz));
  for (let day = 0; day < 60; day++) {
    for (const slot of cfg.postSlots) {
      const [h, min] = slot.split(":").map(Number);
      const d = zoned(localToday.getUTCFullYear(), localToday.getUTCMonth(), localToday.getUTCDate() + day, h, min, tz);
      if (d.getTime() >= minTime && !takenSet.has(d.getTime())) return d;
    }
  }
  throw new Error("Kein freier Slot in den nächsten 60 Tagen");
}
