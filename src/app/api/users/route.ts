import { json, requireUser, toPublic } from "@/server/auth";
import { readDB } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const db = await readDB();
  return json({ users: db.users.map(toPublic), adminCode: db.settings.adminCode ?? null });
}
