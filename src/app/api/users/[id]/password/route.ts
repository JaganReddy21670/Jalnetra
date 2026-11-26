import { randomBytes } from "crypto";
import { fail, hashPassword, json, requireUser } from "@/server/auth";
import { mutate } from "@/server/db";

type Ctx = { params: Promise<{ id: string }> };

/** Admin resets an engineer's password to a new temporary one (returned once, to hand over). */
export async function POST(_req: Request, { params }: Ctx) {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const { id } = await params;
  // Easy to read out loud: no 0/O or 1/l/I.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  const temp = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  const creds = await hashPassword(temp);
  const result = await mutate((db) => {
    const u = db.users.find((x) => x.id === id);
    if (!u) return { error: "User not found", status: 404 };
    if (u.role === "admin") return { error: "Administrators reset their own password with the setup code", status: 400 };
    Object.assign(u, creds);
    if (u.provider === "google") u.provider = "password";
    db.audit.push({ at: new Date().toISOString(), actor: g.user.email, action: "Engineer password reset", detail: u.email });
    return { email: u.email };
  });
  if ("error" in result) return fail(result.error!, result.status);
  return json({ email: result.email, tempPassword: temp });
}
