import { NextResponse } from "next/server";
import { createSessionCookie, fail, roleMismatch, verifyPassword } from "@/server/auth";
import { readDB, toPublic } from "@/server/db";

export async function POST(req: Request) {
  const { email, password, role } = await req.json().catch(() => ({}));
  const db = await readDB();
  const user = db.users.find((u) => u.email === String(email ?? "").trim().toLowerCase());
  if (user && user.provider === "google" && !user.passwordHash) return fail("This account uses Google sign-in. Please continue with Google.", 400);
  if (!user || !(await verifyPassword(String(password ?? ""), user))) return fail("Incorrect email or password", 401);
  const mismatch = roleMismatch(user, role);
  if (mismatch) return fail(mismatch, 403);
  const res = NextResponse.json({ user: toPublic(user) });
  await createSessionCookie(res, user.id);
  return res;
}
