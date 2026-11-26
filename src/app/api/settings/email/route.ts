import { fail, json, requireUser } from "@/server/auth";
import { mutate, readDB } from "@/server/db";
import { buildWeekly, emailReady, sendWeekly } from "@/server/mailer";

export const dynamic = "force-dynamic";

/** GET: HTML preview of the weekly summary (admin only). */
export async function GET() {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const w = buildWeekly(await readDB());
  return new Response(w.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

/** POST: send the weekly summary right now (used as "Send test"). */
export async function POST() {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const db = await readDB();
  if (!emailReady(db.settings.email)) return fail("Fill in the email account and at least one recipient first");
  try {
    const r = await sendWeekly(db, db.settings.email);
    await mutate((d) => d.audit.push({ at: new Date().toISOString(), actor: g.user.email, action: "Weekly summary sent manually", detail: `${r.accepted.length} recipient(s)` }));
    return json({ ok: true, accepted: r.accepted });
  } catch (e) {
    const msg = (e as Error).message;
    const hint = /Invalid login|Username and Password not accepted|535/i.test(msg)
      ? " For Gmail, use an App Password (Google Account → Security → 2-Step Verification → App passwords), not your normal password."
      : "";
    return fail(`Couldn't send: ${msg}${hint}`, 502);
  }
}
