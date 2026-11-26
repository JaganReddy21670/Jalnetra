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
  await runWeeklyIfDue();
}

/**
 * Sends the weekly summary if today is the chosen day (IST) and it hasn't gone out today.
 * `ignoreTime` is used by Vercel Cron, which calls this once a day at a fixed hour.
 */
export async function runWeeklyIfDue(opts: { ignoreTime?: boolean } = {}): Promise<string> {
  if (running) return "busy";
  running = true;
  try {
    const db = await readDB();
    const email = db.settings.email;
    if (!emailReady(email) || !email.weekly.enabled) return "not configured";
    const p = istParts(new Date());
    const [h, m] = email.weekly.time.split(":").map(Number);
    const weekday = new Date(`${p.date}T00:00:00Z`).getUTCDay();
    if (weekday !== email.weekly.day) return "not today";
    if (email.lastWeeklySent === p.date) return "already sent";
    if (!opts.ignoreTime && p.minutes < h * 60 + m) return "too early";

    // Claim today's slot first so a crash/retry can't double-send.
    await mutate((d) => {
      if (d.settings.email) d.settings.email.lastWeeklySent = p.date;
    });
    const r = await sendWeekly(db, email);
    await mutate((d) => d.audit.push({ at: new Date().toISOString(), actor: "System", action: "Weekly summary emailed", detail: `${r.accepted.length} recipient(s)` }));
    console.log("[scheduler] weekly summary sent:", r.subject);
    return "sent";
  } catch (e) {
    console.error("[scheduler] weekly summary failed:", (e as Error).message);
    await mutate((d) => d.audit.push({ at: new Date().toISOString(), actor: "System", action: "Weekly summary failed", detail: (e as Error).message.slice(0, 200) })).catch(() => undefined);
    return "failed";
  } finally {
    running = false;
  }
}
