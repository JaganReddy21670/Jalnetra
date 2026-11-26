import { createHmac, randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { promisify } from "util";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { DATA_DIR, mutate, readDB, toPublic, usingPostgres, type DB, type UserRecord } from "./db";

const scrypt = promisify(_scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "fc_session";
const SESSION_DAYS = 14;

let secretCache: string | null = null;
async function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (secretCache) return secretCache;
  if (usingPostgres()) {
    // Serverless hosts have no writable disk: keep the generated key in the database.
    secretCache = await mutate((db) => (db.settings.sessionSecret ??= randomBytes(32).toString("hex")));
    return secretCache;
  }
  const file = path.join(DATA_DIR, ".session-secret");
  try {
    secretCache = (await fs.readFile(file, "utf8")).trim();
  } catch {
    secretCache = randomBytes(32).toString("hex");
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(file, secretCache, "utf8");
  }
  return secretCache;
}

export async function hashPassword(pw: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(pw, salt, 64)).toString("hex");
  return { salt, passwordHash: hash };
}

export async function verifyPassword(pw: string, u: UserRecord) {
  if (!u.salt || !u.passwordHash) return false;
  const hash = await scrypt(pw, u.salt, 64);
  const stored = Buffer.from(u.passwordHash, "hex");
  return stored.length === hash.length && timingSafeEqual(stored, hash);
}

async function sign(payload: string) {
  return createHmac("sha256", await secret()).update(payload).digest("base64url");
}

export async function createSessionCookie(res: NextResponse, userId: string) {
  const exp = Date.now() + SESSION_DAYS * 86400_000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const token = `${payload}.${await sign(payload)}`;
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
}

/** Returns the signed-in user (fresh from the DB) or null. */
export async function currentUser(): Promise<UserRecord | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > exp) return null;
    const db = await readDB();
    return db.users.find((u) => u.id === uid) ?? null;
  } catch {
    return null;
  }
}

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

/** Guard for route handlers. */
export async function requireUser(role?: "admin") {
  const u = await currentUser();
  if (!u) return { error: fail("Please sign in", 401) } as const;
  if (role && u.role !== role) return { error: fail("Administrator access only", 403) } as const;
  return { user: u } as const;
}

export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** Short human-friendly code existing admins share to let someone else register as admin. */
export function ensureAdminCode(db: DB) {
  if (!db.settings.adminCode) db.settings.adminCode = randomBytes(4).toString("hex").toUpperCase();
  return db.settings.adminCode;
}

/**
 * Decides the role for a brand-new account. Engineers are always allowed.
 * Admin: free for the very first admin; afterwards needs the admin access code (or ADMIN_EMAILS).
 */
export function resolveNewRole(db: DB, wanted: unknown, code: unknown, email: string): { role: "admin" | "engineer" } | { error: string } {
  if (wanted !== "admin") return { role: "engineer" };
  const given = String(code ?? "").trim().toUpperCase();
  const setup = setupCode();
  const hasAdmin = db.users.some((u) => u.role === "admin");
  if (isAdminEmail(email) || (setup && given === setup)) {
    ensureAdminCode(db);
    return { role: "admin" };
  }
  if (!hasAdmin) {
    // Public deployments set ADMIN_SETUP_CODE so a stranger can't claim the first admin slot.
    if (setup) return { error: "Enter the setup code to create the first Administrator account." };
    ensureAdminCode(db);
    return { role: "admin" };
  }
  if (given === ensureAdminCode(db)) return { role: "admin" };
  return { error: "Admin access code is missing or incorrect. Ask an existing administrator for it." };
}

/** Optional one-time code (env ADMIN_SETUP_CODE) required to create admins on a public server. */
export function setupCode() {
  return (process.env.ADMIN_SETUP_CODE ?? "").trim().toUpperCase() || null;
}

export function roleMismatch(u: UserRecord, wanted: unknown) {
  if (wanted !== "admin" && wanted !== "engineer") return null;
  if (u.role === wanted) return null;
  return u.role === "admin"
    ? "This is an Administrator account. Go back and choose Administrator."
    : "This is an Engineer account. Go back and choose Engineer.";
}

/** Google OAuth Client ID: .env.local wins; otherwise the one an admin saved in Settings. */
export async function googleClientId(): Promise<string | null> {
  if (process.env.GOOGLE_CLIENT_ID) return process.env.GOOGLE_CLIENT_ID;
  return (await readDB()).settings.googleClientId ?? null;
}

export { toPublic };
