import { codeLocked, fail, hashPassword, json, recordCodeFailure, setupCode } from "@/server/auth";
import { mutate, readDB } from "@/server/db";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Administrator "Forgot password": proves ownership with the server's setup code
 * (ADMIN_SETUP_CODE) and sets a new password. Engineers are reset by an admin instead.
 */
export async function POST(req: Request) {
  const { email, code, newPassword } = await req.json().catch(() => ({}));
  const setup = setupCode();
  if (!setup) return fail("Password reset with a setup code isn't enabled on this server", 403);
  const pw = String(newPassword ?? "");
  if (pw.length < 8) return fail("New password must be at least 8 characters");
  if (pw.length > 200) return fail("Password must be 200 characters or fewer");
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  const given = String(code ?? "").replace(/\s+/g, "").toUpperCase();

  const locked = codeLocked(await readDB(), "reset");
  if (locked) return fail(locked, 429);
  if (given !== setup) {
    await mutate((db) => recordCodeFailure(db, "reset"));
    await sleep(1200); // slow down guessing
    return fail("That setup code is incorrect", 403);
  }
  const creds = await hashPassword(pw);
  const result = await mutate((db) => {
    const u = db.users.find((x) => x.email === cleanEmail);
    if (!u || u.role !== "admin") return { error: "No Administrator account with that email" };
    Object.assign(u, creds);
    if (u.provider === "google") u.provider = "password";
    db.audit.push({ at: new Date().toISOString(), actor: u.email, action: "Admin password reset with setup code", detail: "" });
    return { ok: true };
  });
  if ("error" in result) {
    await sleep(800);
    return fail(result.error!, 404);
  }
  return json({ ok: true });
}
