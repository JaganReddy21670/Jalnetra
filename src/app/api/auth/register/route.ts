import { NextResponse } from "next/server";
import { createSessionCookie, fail, hashPassword, resolveNewRole } from "@/server/auth";
import { mutate, newId, toPublic, type UserRecord } from "@/server/db";

export async function POST(req: Request) {
  const { name, email, password, role, adminCode } = await req.json().catch(() => ({}));
  const cleanEmail = String(email ?? "").trim().toLowerCase();
  const cleanName = String(name ?? "").trim();
  if (cleanName.length < 2) return fail("Please enter your full name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return fail("Please enter a valid email address");
  if (String(password ?? "").length < 8) return fail("Password must be at least 8 characters");

  const creds = await hashPassword(String(password));
  const result = await mutate((db) => {
    if (db.users.some((u) => u.email === cleanEmail)) return { error: "An account with this email already exists. Please sign in.", status: 409 };
    const r = resolveNewRole(db, role, adminCode, cleanEmail);
    if ("error" in r) return { error: r.error, status: 403 };
    const user: UserRecord = {
      id: newId("U"),
      name: cleanName,
      email: cleanEmail,
      role: r.role,
      provider: "password",
      onboarded: false,
      createdAt: new Date().toISOString(),
      ...creds,
    };
    db.users.push(user);
    db.audit.push({ at: user.createdAt, actor: user.email, action: "Account created", detail: `${user.role} · password` });
    return { user };
  });
  if ("error" in result) return fail(result.error!, result.status);
  const res = NextResponse.json({ user: toPublic(result.user) });
  await createSessionCookie(res, result.user.id);
  return res;
}
