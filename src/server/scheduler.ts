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
  // Local/self-hosted runs: 4 PM reminder, 5 PM deadline alerts (IST). Each runs once per day.
  try {
    const m = istParts(new Date()).minutes;
    if (m >= 16 * 60 && m < 17 * 60) await runDailyAlerts("reminder");
    if (m >= 17 * 60) await runDailyAlerts("deadline");
  } catch (e) {
    console.error("[scheduler] daily alerts failed:", (e as Error).message);
  }
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

// ---------------------------------------------------------------------------
// Daily deadline alerts: 4 PM reminder and 5 PM missed + escalation (IST).

export type AlertSlot = "reminder" | "deadline";

const appUrl = () => (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Runs one daily alert. Safe to call repeatedly: each (date, slot) runs once.
 * In-app notifications are always created; emails go out only when an email account is set up.
 */
export async function runDailyAlerts(slot: AlertSlot, now = new Date()): Promise<string> {
  const { newId } = await import("./db");
  const { buildEngineerAlert, buildEscalation, sendMail, smtpReady } = await import("./mailer");
  const { deviceType } = await import("@/lib/devices");
  const { fmtDate } = await import("@/lib/format");
  const { defaultAlerts } = await import("./db");

  const date = istParts(now).date;
  const key = `${date}:${slot}`;
  const db0 = await readDB();
  const alerts = { ...defaultAlerts(), ...(db0.settings.alerts ?? {}) };
  if (slot === "reminder" && !alerts.reminder) return "reminder off";
  if (slot === "deadline" && !alerts.deadline) return "deadline alerts off";
  if (db0.settings.alertLog?.[key]) return "already sent";

  // Who still has unchecked active devices today?
  const checked = new Set(db0.inspections.filter((i) => i.date === date).map((i) => i.deviceId));
  const pendingByEngineer = db0.users
    .map((u) => {
      const mine = db0.devices.filter((d) => d.active && d.engineerId === u.id && istParts(new Date(d.createdAt)).date <= date);
      const pending = mine.filter((d) => !checked.has(d.id)).map((d) => ({ name: d.name, type: deviceType(d.type).label, location: d.location }));
      return { u, assigned: mine.length, pending };
    })
    .filter((x) => x.pending.length > 0);
  const admins = db0.users.filter((u) => u.role === "admin");
  const label = fmtDate(date);

  // Claim the slot first and write in-app notifications in the same save, so nothing runs twice.
  const claimed = await mutate((db) => {
    db.settings.alertLog ??= {};
    if (db.settings.alertLog[key]) return false;
    db.settings.alertLog[key] = new Date().toISOString();
    // Forget entries older than two weeks.
    for (const k of Object.keys(db.settings.alertLog)) {
      if ((Date.parse(date) - Date.parse(k.slice(0, 10))) / 864e5 > 14) delete db.settings.alertLog[k];
    }
    db.notifications ??= [];
    const at = new Date().toISOString();
    for (const p of pendingByEngineer) {
      const n = p.pending.length;
      db.notifications.push({
        id: newId("NTF"),
        userId: p.u.id,
        at,
        kind: slot === "reminder" ? "reminder" : "missed",
        title: slot === "reminder" ? `${n} node${n > 1 ? "s" : ""} left to check before 5:00 PM` : `${n} node${n > 1 ? "s" : ""} missed today's 5:00 PM deadline`,
        body: p.pending.map((d) => d.name).join(", "),
        read: false,
      });
    }
    if (slot === "deadline" && pendingByEngineer.length) {
      const missed = pendingByEngineer.reduce((a, p) => a + p.pending.length, 0);
      for (const a of admins)
        db.notifications.push({
          id: newId("NTF"),
          userId: a.id,
          at,
          kind: "escalation",
          title: `${missed} node${missed > 1 ? "s" : ""} not checked by 5:00 PM`,
          body: pendingByEngineer.map((p) => `${p.u.name}: ${p.pending.length}`).join(" · "),
          read: false,
        });
    }
    if (db.notifications.length > 500) db.notifications = db.notifications.slice(-500);
    db.audit.push({ at, actor: "System", action: slot === "reminder" ? "4 PM reminders" : "5 PM deadline alerts", detail: `${pendingByEngineer.length} engineer(s) with unchecked nodes` });
    return true;
  });
  if (!claimed) return "already sent";
  if (!pendingByEngineer.length) return "everyone checked; nothing to send";

  const email = db0.settings.email;
  if (!smtpReady(email)) return `in-app only (${pendingByEngineer.length} engineer(s)); no email account set up`;

  let sent = 0;
  const failures: string[] = [];
  const link = appUrl();
  for (const p of pendingByEngineer) {
    const m = buildEngineerAlert(slot === "reminder" ? "reminder" : "missed", p.u.name, label, p.pending, `${link}/checklist`);
    try {
      await sendMail(email, { to: [p.u.email], ...m });
      sent++;
    } catch (e) {
      failures.push(`${p.u.email}: ${(e as Error).message}`);
    }
  }
  if (slot === "deadline") {
    const to = Array.from(new Set([...admins.map((a) => a.email), ...alerts.extra])).filter(Boolean);
    if (to.length) {
      const m = buildEscalation(label, pendingByEngineer.map((p) => ({ engineer: p.u.name, email: p.u.email, devices: p.pending, assigned: p.assigned })), link);
      try {
        await sendMail(email, { to, ...m });
        sent++;
      } catch (e) {
        failures.push(`escalation: ${(e as Error).message}`);
      }
    }
  }
  if (failures.length)
    await mutate((db) => db.audit.push({ at: new Date().toISOString(), actor: "System", action: "Alert email failed", detail: failures.join(" | ").slice(0, 300) })).catch(() => undefined);
  return `${sent} email(s) sent${failures.length ? `, ${failures.length} failed` : ""}`;
}
