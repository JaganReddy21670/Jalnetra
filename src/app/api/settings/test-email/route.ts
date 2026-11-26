import { fail, json, requireUser } from "@/server/auth";
import { readDB } from "@/server/db";
import { sendMail, smtpReady } from "@/server/mailer";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Sends a short test email to the signed-in administrator, using the saved email account. */
export async function POST() {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const email = (await readDB()).settings.email;
  if (!smtpReady(email)) return fail("Save the email account (address and App Password) first");
  try {
    await sendMail(email, {
      to: [g.user.email],
      subject: `${APP_NAME} test email`,
      html: `<p style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px">This is a test from ${APP_NAME}. Your email account works, so reminders, deadline alerts and weekly summaries can be delivered.</p>`,
      text: `This is a test from ${APP_NAME}. Your email account works.`,
    });
    return json({ ok: true, to: g.user.email });
  } catch (e) {
    const msg = (e as Error).message;
    const hint = /Invalid login|not accepted|535|534/i.test(msg) ? " For Gmail, use a 16-letter App Password, not your normal password." : "";
    return fail(`Couldn't send: ${msg}${hint}`, 502);
  }
}
