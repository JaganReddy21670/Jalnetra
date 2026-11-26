import { istParts } from "@/lib/format";
import { mutate, readDB } from "./db";
import { emailReady, sendWeekly } from "./mailer";

const g = globalThis as unknown as { __fcScheduler?: NodeJS.Timeout };

/** Checks once a minute whether the weekly summary is due (IST) and sends it at most once per day. */
export function startScheduler() {
  if (g.__fcScheduler) return; // survive dev hot-reloads without duplicating timers
  g.__fcScheduler = setInterval(tick, 60_000);
  setTimeout(tick, 5_000);
  console.log("[scheduler] weekly summary scheduler started");
}

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    const db = await readDB();
    const email = db.settings.email;
    if (!emailReady(email) || !email.weekly.enabled) return;
    const p = istParts(new Date());
    const [h, m] = email.weekly.time.split(":").map(Number);
    const weekday = new Date(`${p.date}T00:00:00Z`).getUTCDay();
    if (weekday !== email.weekly.day || p.minutes < h * 60 + m || email.lastWeeklySent === p.date) return;

    // Claim today's slot first so a crash/retry can't double-send.
    await mutate((d) => {
      if (d.settings.email) d.settings.email.lastWeeklySent = p.date;
    });
    const r = await sendWeekly(db, email);
    await mutate((d) => d.audit.push({ at: new Date().toISOString(), actor: "System", action: "Weekly summary emailed", detail: `${r.accepted.length} recipient(s)` }));
    console.log("[scheduler] weekly summary sent:", r.subject);
  } catch (e) {
    console.error("[scheduler] weekly summary failed:", (e as Error).message);
    await mutate((d) => d.audit.push({ at: new Date().toISOString(), actor: "System", action: "Weekly summary failed", detail: (e as Error).message.slice(0, 200) })).catch(() => undefined);
  } finally {
    running = false;
  }
}
