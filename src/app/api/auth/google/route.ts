import { NextResponse } from "next/server";
import { createSessionCookie, fail, googleClientId, resolveNewRole, roleMismatch } from "@/server/auth";
import { mutate, newId, toPublic, type UserRecord } from "@/server/db";

/** Verifies a Google Identity Services ID token and signs the user in (creating the account if new). */
export async function POST(req: Request) {
  const clientId = await googleClientId();
  if (!clientId) return fail("Google sign-in is not configured on this server", 501);
  const { credential, role, adminCode } = await req.json().catch(() => ({}));
  if (!credential) return fail("Missing Google credential");

  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!r.ok) return fail("Google sign-in failed. Please try again.", 401);
  const info = await r.json();
  if (info.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(info.iss)) return fail("Invalid Google token", 401);
  if (info.email_verified !== "true" && info.email_verified !== true) return fail("Your Google email is not verified", 401);

  const email = String(info.email).toLowerCase();
  const result = await mutate((db) => {
    const u = db.users.find((x) => x.googleSub === info.sub || x.email === email);
    if (u) {
      const mismatch = roleMismatch(u, role);
      if (mismatch) return { error: mismatch, status: 403 };
      u.googleSub = info.sub;
      u.picture = info.picture;
      return { user: u };
    }
    const rr = resolveNewRole(db, role, adminCode, email);
    if ("error" in rr) return { error: rr.error, status: 403 };
    const nu: UserRecord = {
      id: newId("U"),
      name: info.name || email.split("@")[0],
      email,
      role: rr.role,
      provider: "google",
      picture: info.picture,
      googleSub: info.sub,
      onboarded: false,
      createdAt: new Date().toISOString(),
    };
    db.users.push(nu);
    db.audit.push({ at: nu.createdAt, actor: email, action: "Account created", detail: `${nu.role} · google` });
    return { user: nu };
  });
  if ("error" in result) return fail(result.error!, result.status);
  const res = NextResponse.json({ user: toPublic(result.user) });
  await createSessionCookie(res, result.user);
  return res;
}
