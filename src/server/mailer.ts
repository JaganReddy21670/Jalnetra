import nodemailer from "nodemailer";
import { APP_NAME, APP_SLUG } from "@/lib/brand";
import { DEVICE_TYPES } from "@/lib/devices";
import { fmtDate, istParts } from "@/lib/format";
import { indexInspections, shiftDate, uptime } from "@/lib/status";
import type { DB } from "./db";
import { workbookBuffer } from "./excel";

export interface EmailSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  recipients: string[];
  weekly: { enabled: boolean; day: number; time: string }; // day 0=Sun, time "HH:MM" IST
  lastWeeklySent?: string; // IST date of last automatic send
}

export const defaultEmail = (): EmailSettings => ({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  user: "",
  pass: "",
  from: "",
  recipients: [],
  weekly: { enabled: false, day: 1, time: "09:00" },
});

export function emailReady(e?: EmailSettings): e is EmailSettings {
  return !!e && !!e.host && !!e.user && !!e.pass && e.recipients.length > 0;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const tone = (p: number | null) => (p === null ? "#8E8E93" : p >= 95 ? "#248A3D" : p >= 80 ? "#C93400" : "#D70015");

/** Summary of the 7 IST days ending yesterday (a complete week). */
export function buildWeekly(db: DB, now = new Date()) {
  const today = istParts(now).date;
  const to = shiftDate(today, -1);
  const from = shiftDate(today, -7);
  const dates = Array.from({ length: 7 }, (_, k) => shiftDate(from, k));
  const idx = indexInspections(db.inspections);
  const active = db.devices.filter((d) => d.active);
  const created = (id: string) => istParts(new Date(active.find((d) => d.id === id)!.createdAt)).date;

  let expected = 0;
  let done = 0;
  let online = 0;
  let offline = 0;
  let late = 0;
  const reasons = new Map<string, number>();
  for (const d of active)
    for (const date of dates) {
      if (date < created(d.id)) continue;
      expected++;
      const i = idx.get(`${d.id}|${date}`);
      if (!i) continue;
      done++;
      if (i.late) late++;
      if (i.answers.dataStatus === "Online") online++;
      else {
        offline++;
        reasons.set(i.answers.offlineReason, (reasons.get(i.answers.offlineReason) ?? 0) + 1);
      }
    }

  const engineers = db.users
    .filter((u) => active.some((d) => d.engineerId === u.id))
    .map((u) => {
      const mine = active.filter((d) => d.engineerId === u.id);
      let exp = 0;
      let dn = 0;
      let off = 0;
      for (const d of mine)
        for (const date of dates) {
          if (date < created(d.id)) continue;
          exp++;
          const i = idx.get(`${d.id}|${date}`);
          if (i) {
            dn++;
            if (i.answers.dataStatus === "Offline") off++;
          }
        }
      return { name: u.name, devices: mine.length, done: dn, expected: exp, offline: off };
    })
    .sort((a, b) => pct(a.done, a.expected) - pct(b.done, b.expected));

  const worst = active
    .map((d) => ({ d, u: uptime(d, idx, to, 7) }))
    .filter((x) => x.u.pct !== null && x.u.pct < 100)
    .sort((a, b) => a.u.pct! - b.u.pct!)
    .slice(0, 6);

  const uptimePct = online + offline ? pct(online, online + offline) : null;
  const completion = pct(done, expected);
  const range = `${fmtDate(from)} – ${fmtDate(to)}`;
  const subject = `${APP_NAME} weekly summary · ${range} · ${completion}% checked, ${uptimePct ?? "—"}% uptime`;

  const kpi = (label: string, value: string, color = "#1C1C1E") =>
    `<td style="padding:14px 10px;background:#F5F6FA;border-radius:14px;text-align:center;width:25%"><div style="font-size:26px;font-weight:700;color:${color}">${value}</div><div style="font-size:12px;color:#8E8E93;margin-top:2px">${label}</div></td>`;
  const th = (t: string, align = "left") => `<th style="text-align:${align};font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8E8E93;padding:8px 6px;border-bottom:1px solid #E5E5EA">${t}</th>`;
  const td = (t: string, align = "left", extra = "") => `<td style="text-align:${align};padding:9px 6px;border-bottom:1px solid #F2F2F7;font-size:14px;${extra}">${t}</td>`;

  const html = `<!doctype html><html><body style="margin:0;background:#EEF1F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#1C1C1E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#fff;border-radius:24px;padding:28px">
<tr><td>
  <div style="font-size:13px;font-weight:600;color:#007AFF;letter-spacing:.02em">${esc(APP_NAME.toUpperCase())} · WEEKLY SUMMARY</div>
  <div style="font-size:28px;font-weight:700;letter-spacing:-.02em;margin-top:4px">${esc(range)}</div>
  <div style="font-size:15px;color:#8E8E93;margin-top:4px">${active.length} active devices · ${engineers.length} engineers</div>
  <table role="presentation" width="100%" cellspacing="8" style="margin:20px -8px 8px"><tr>
    ${kpi("Checks done", `${completion}%`, tone(completion))}
    ${kpi("Uptime", uptimePct === null ? "—" : `${uptimePct}%`, tone(uptimePct))}
    ${kpi("Offline reports", String(offline), offline ? "#D70015" : "#248A3D")}
    ${kpi("Late checks", String(late), late ? "#C93400" : "#248A3D")}
  </tr></table>
  <div style="font-size:13px;color:#8E8E93">${done} of ${expected} expected daily checks were submitted.</div>

  <div style="font-size:17px;font-weight:700;margin:26px 0 6px">Engineers</div>
  <table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse">
    <tr>${th("Engineer")}${th("Devices", "center")}${th("Checks", "center")}${th("Done", "right")}${th("Offline", "right")}</tr>
    ${engineers.map((e) => `<tr>${td(esc(e.name), "left", "font-weight:600")}${td(String(e.devices), "center")}${td(`${e.done}/${e.expected}`, "center")}${td(`${pct(e.done, e.expected)}%`, "right", `font-weight:700;color:${tone(pct(e.done, e.expected))}`)}${td(String(e.offline), "right", e.offline ? "color:#D70015" : "")}</tr>`).join("") || `<tr>${td("No engineers with devices yet")}</tr>`}
  </table>

  ${worst.length ? `<div style="font-size:17px;font-weight:700;margin:26px 0 6px">Lowest uptime this week</div>
  <table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse">
    <tr>${th("Device")}${th("Type")}${th("Uptime", "right")}</tr>
    ${worst.map(({ d, u }) => `<tr>${td(`<b>${esc(d.name)}</b><div style="font-size:12px;color:#8E8E93">${esc(d.location)}</div>`)}${td(esc(DEVICE_TYPES.find((t) => t.key === d.type)?.label ?? ""))}${td(`${u.pct}%`, "right", `font-weight:700;color:${tone(u.pct)}`)}</tr>`).join("")}
  </table>` : `<p style="margin-top:22px;font-size:15px;color:#248A3D;font-weight:600">Every checked device was online all week.</p>`}

  ${reasons.size ? `<div style="font-size:17px;font-weight:700;margin:26px 0 8px">Offline reasons</div>
  <div>${[...reasons.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `<span style="display:inline-block;margin:0 6px 6px 0;padding:6px 12px;border-radius:999px;background:#FFEDEC;color:#D70015;font-size:13px;font-weight:600">${esc(r)} · ${n}</span>`).join("")}</div>` : ""}

  <div style="margin-top:26px;padding:14px 16px;background:#F5F6FA;border-radius:14px;font-size:13px;color:#3C3C43">📎 The full Excel workbook (one sheet per device type, 31-day status grid, uptime and inspection log) is attached.</div>
</td></tr></table>
<div style="font-size:12px;color:#8E8E93;margin-top:14px">Sent automatically by ${esc(APP_NAME)}</div>
</td></tr></table></body></html>`;

  const text = `${APP_NAME} weekly summary (${range})
Checks done: ${completion}% (${done}/${expected})
Uptime: ${uptimePct ?? "—"}%
Offline reports: ${offline} · Late checks: ${late}

${engineers.map((e) => `${e.name}: ${e.done}/${e.expected} checks, ${e.offline} offline`).join("\n")}

The Excel workbook is attached.`;

  return { subject, html, text, to, from };
}

export async function sendWeekly(db: DB, email: EmailSettings, now = new Date()) {
  const w = buildWeekly(db, now);
  const transport = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.secure,
    auth: { user: email.user, pass: email.pass },
  });
  const xlsx = await workbookBuffer(db);
  const info = await transport.sendMail({
    from: email.from || `${APP_NAME} <${email.user}>`,
    to: email.recipients.join(", "),
    subject: w.subject,
    html: w.html,
    text: w.text,
    attachments: [{ filename: `${APP_SLUG}-Weekly-${w.to}.xlsx`, content: xlsx }],
  });
  return { messageId: info.messageId, accepted: info.accepted, subject: w.subject };
}

// ---------------------------------------------------------------------------
// Daily deadline alerts (4 PM reminder, 5 PM missed + escalation) and a generic sender.

/** SMTP account filled in (recipients are per message for alerts). */
export function smtpReady(e?: EmailSettings): e is EmailSettings {
  return !!e && !!e.host && !!e.user && !!e.pass;
}

export async function sendMail(email: EmailSettings, msg: { to: string[]; subject: string; html: string; text: string }) {
  const transport = nodemailer.createTransport({
    host: email.host,
    port: email.port,
    secure: email.secure,
    auth: { user: email.user, pass: email.pass },
  });
  const info = await transport.sendMail({
    from: email.from || `${APP_NAME} <${email.user}>`,
    to: msg.to.join(", "),
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  });
  return { accepted: info.accepted as string[] };
}

export interface PendingDevice {
  name: string;
  type: string;
  location: string;
}

function shell(kicker: string, kickerColor: string, title: string, inner: string) {
  return `<!doctype html><html><body style="margin:0;background:#EEF1F7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#1C1C1E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:24px;padding:26px"><tr><td>
<div style="font-size:13px;font-weight:600;color:${kickerColor};letter-spacing:.02em">${esc(kicker)}</div>
<div style="font-size:24px;font-weight:700;letter-spacing:-.02em;margin-top:4px">${esc(title)}</div>
${inner}
</td></tr></table>
<div style="font-size:12px;color:#8E8E93;margin-top:14px">Sent automatically by ${esc(APP_NAME)}</div>
</td></tr></table></body></html>`;
}

const deviceList = (list: PendingDevice[]) =>
  `<table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse;margin-top:14px">${list
    .map(
      (d) =>
        `<tr><td style="padding:10px 6px;border-bottom:1px solid #F2F2F7;font-size:15px"><b>${esc(d.name)}</b><div style="font-size:12px;color:#8E8E93">${esc(d.type)} · ${esc(d.location)}</div></td></tr>`,
    )
    .join("")}</table>`;

/** Engineer email: 4 PM reminder ("reminder") or 5 PM missed notice ("missed"). */
export function buildEngineerAlert(kind: "reminder" | "missed", name: string, dateLabel: string, list: PendingDevice[], link: string) {
  const n = list.length;
  const first = name.split(" ")[0];
  if (kind === "reminder") {
    const subject = `Reminder: ${n} node${n > 1 ? "s" : ""} still to check before 5:00 PM`;
    const html = shell(`${APP_NAME.toUpperCase()} · 4 PM REMINDER`, "#C93400", `${n} node${n > 1 ? "s" : ""} left to check today`,
      `<p style="font-size:15px;color:#3C3C43;margin:12px 0 0">Hi ${esc(first)}, these nodes haven't been checked yet on ${esc(dateLabel)}. Please record whether data is coming before <b>5:00 PM IST</b>.</p>${deviceList(list)}
<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#007AFF;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Open today's checklist</a></p>`);
    const text = `Hi ${first}, ${n} node(s) still to check before 5:00 PM IST (${dateLabel}):\n${list.map((d) => `- ${d.name} (${d.location})`).join("\n")}\n\n${link}`;
    return { subject, html, text };
  }
  const subject = `Missed: ${n} node${n > 1 ? "s" : ""} not checked by 5:00 PM`;
  const html = shell(`${APP_NAME.toUpperCase()} · DEADLINE PASSED`, "#D70015", `${n} node${n > 1 ? "s were" : " was"} not checked today`,
    `<p style="font-size:15px;color:#3C3C43;margin:12px 0 0">Hi ${esc(first)}, the 5:00 PM IST deadline on ${esc(dateLabel)} has passed. Your administrator has been informed. You can still submit these checks; they will be marked late.</p>${deviceList(list)}
<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#007AFF;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Submit late checks</a></p>`);
  const text = `Hi ${first}, the 5:00 PM deadline passed (${dateLabel}). Not checked:\n${list.map((d) => `- ${d.name} (${d.location})`).join("\n")}\n\n${link}`;
  return { subject, html, text };
}

export interface EscalationRow {
  engineer: string;
  email: string;
  devices: PendingDevice[];
  assigned: number;
}

/** 5 PM escalation to administrators: who missed what. */
export function buildEscalation(dateLabel: string, rows: EscalationRow[], link: string) {
  const missed = rows.reduce((a, r) => a + r.devices.length, 0);
  const subject = `Escalation: ${missed} node${missed > 1 ? "s" : ""} not checked by 5:00 PM (${dateLabel})`;
  const th = (t: string) => `<th style="text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#8E8E93;padding:8px 6px;border-bottom:1px solid #E5E5EA">${t}</th>`;
  const td = (t: string, extra = "") => `<td style="padding:10px 6px;border-bottom:1px solid #F2F2F7;font-size:14px;vertical-align:top;${extra}">${t}</td>`;
  const html = shell(`${APP_NAME.toUpperCase()} · 5 PM ESCALATION`, "#D70015", `${missed} node${missed > 1 ? "s" : ""} missed the deadline`,
    `<p style="font-size:15px;color:#3C3C43;margin:12px 0 0">As of 5:00 PM IST on ${esc(dateLabel)}, these engineers have nodes without a daily check. Each engineer has also been emailed.</p>
<table role="presentation" width="100%" cellspacing="0" style="border-collapse:collapse;margin-top:14px"><tr>${th("Engineer")}${th("Not checked")}${th("Nodes")}</tr>${rows
      .map(
        (r) =>
          `<tr>${td(`<b>${esc(r.engineer)}</b><div style="font-size:12px;color:#8E8E93">${esc(r.email)}</div>`)}${td(`<b style="color:#D70015">${r.devices.length}</b> of ${r.assigned}`)}${td(
            r.devices.map((d) => `${esc(d.name)} <span style="color:#8E8E93">· ${esc(d.location)}</span>`).join("<br>"),
          )}</tr>`,
      )
      .join("")}</table>
<p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#007AFF;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:999px">Open the overview</a></p>`);
  const text = `${missed} node(s) not checked by 5:00 PM IST (${dateLabel}):\n${rows.map((r) => `${r.engineer} <${r.email}>: ${r.devices.map((d) => d.name).join(", ")}`).join("\n")}\n\n${link}`;
  return { subject, html, text };
}
