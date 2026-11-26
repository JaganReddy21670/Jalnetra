import { ensureAdminCode, fail, json, requireUser } from "@/server/auth";
import { defaultAlerts, mutate, readDB, type AlertSettings } from "@/server/db";
import { defaultEmail, type EmailSettings } from "@/server/mailer";

export const dynamic = "force-dynamic";

const CLIENT_ID_RE = /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/i;

export async function GET() {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const db = await readDB();
  return json({
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? db.settings.googleClientId ?? null,
    googleFromEnv: !!process.env.GOOGLE_CLIENT_ID,
    adminCode: db.settings.adminCode ?? null,
    email: publicEmail(db.settings.email),
    alerts: { ...defaultAlerts(), ...(db.settings.alerts ?? {}) },
  });
}

/** Never send the SMTP password back to the browser. */
function publicEmail(e?: EmailSettings) {
  const x = { ...defaultEmail(), ...(e ?? {}) };
  const { pass, ...rest } = x;
  return { ...rest, passSet: !!pass };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Admin saves (or clears) the Google Client ID, or rotates the admin access code. */
export async function PATCH(req: Request) {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => ({}));
  if (body.googleClientId !== undefined) {
    const id = String(body.googleClientId ?? "").trim();
    if (id && !CLIENT_ID_RE.test(id)) return fail("That doesn't look like a Google OAuth Client ID (it should end with .apps.googleusercontent.com)");
    if (process.env.GOOGLE_CLIENT_ID) return fail("The Client ID is set in .env.local on the server and can't be changed here", 409);
  }
  let emailPatch: EmailSettings | null = null;
  if (body.email) {
    const e = body.email;
    const recipients = (Array.isArray(e.recipients) ? e.recipients : String(e.recipients ?? "").split(/[,\s;]+/)).map((x: string) => String(x).trim()).filter(Boolean);
    if (recipients.some((r: string) => !EMAIL_RE.test(r))) return fail("One of the recipient emails isn't valid");
    const port = Number(e.port);
    if (!e.host || !port) return fail("SMTP server and port are required");
    if (!/^\d{2}:\d{2}$/.test(String(e.weekly?.time ?? ""))) return fail("Pick a time for the weekly email");
    const host = String(e.host).trim();
    // Google App Passwords are 16 letters, shown as "abcd efgh ijkl mnop": drop the spaces.
    let pass = String(e.pass ?? "").replace(/\s+/g, "");
    if (pass && /(^|\.)gmail\.com$|googlemail\.com$/i.test(host) && !/^[a-z]{16}$/i.test(pass))
      return fail("That isn't a Gmail App Password. Create one at myaccount.google.com/apppasswords: it's 16 letters like 'abcd efgh ijkl mnop'. Your normal Gmail password won't work.");
    if (!pass) pass = "";
    emailPatch = {
      host,
      port,
      secure: !!e.secure,
      user: String(e.user ?? "").trim(),
      pass,
      from: String(e.from ?? "").trim(),
      recipients,
      weekly: { enabled: !!e.weekly?.enabled, day: Math.min(6, Math.max(0, Number(e.weekly?.day ?? 1))), time: String(e.weekly.time) },
    };
  }
  let alertsPatch: AlertSettings | null = null;
  if (body.alerts) {
    const a = body.alerts;
    const extra = (Array.isArray(a.extra) ? a.extra : String(a.extra ?? "").split(/[,\s;]+/)).map((x: string) => String(x).trim()).filter(Boolean);
    if (extra.some((r: string) => !EMAIL_RE.test(r))) return fail("One of the extra alert emails isn't valid");
    alertsPatch = { reminder: !!a.reminder, deadline: !!a.deadline, extra };
  }
  const settings = await mutate((db) => {
    if (alertsPatch) {
      db.settings.alerts = alertsPatch;
      db.audit.push({ at: new Date().toISOString(), actor: g.user.email, action: "Alert settings updated", detail: `4 PM ${alertsPatch.reminder ? "on" : "off"}, 5 PM ${alertsPatch.deadline ? "on" : "off"}` });
    }
    if (emailPatch) {
      const prev = db.settings.email;
      db.settings.email = { ...emailPatch, pass: emailPatch.pass || prev?.pass || "", lastWeeklySent: prev?.lastWeeklySent };
      db.audit.push({ at: new Date().toISOString(), actor: g.user.email, action: "Email settings updated", detail: `${emailPatch.recipients.length} recipient(s), weekly ${emailPatch.weekly.enabled ? "on" : "off"}` });
    }
    const now = new Date().toISOString();
    if (body.googleClientId !== undefined) {
      const id = String(body.googleClientId ?? "").trim();
      if (id) db.settings.googleClientId = id;
      else delete db.settings.googleClientId;
      db.audit.push({ at: now, actor: g.user.email, action: id ? "Google sign-in enabled" : "Google sign-in disabled", detail: id ? id.slice(0, 16) + "…" : "" });
    }
    if (body.rotateAdminCode) {
      delete db.settings.adminCode;
      ensureAdminCode(db);
      db.audit.push({ at: now, actor: g.user.email, action: "Admin access code changed", detail: "" });
    }
    return db.settings;
  });
  return json({ googleClientId: settings.googleClientId ?? null, adminCode: settings.adminCode ?? null, googleFromEnv: !!process.env.GOOGLE_CLIENT_ID, email: publicEmail(settings.email), alerts: { ...defaultAlerts(), ...(settings.alerts ?? {}) } });
}
