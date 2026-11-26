import { json, requireUser } from "@/server/auth";
import { mutate, readDB } from "@/server/db";

export const dynamic = "force-dynamic";

/** The signed-in user's latest notifications (newest first) + unread count. */
export async function GET() {
  const g = await requireUser();
  if ("error" in g) return g.error;
  const db = await readDB();
  const mine = (db.notifications ?? []).filter((n) => n.userId === g.user.id).sort((a, b) => b.at.localeCompare(a.at));
  return json({ notifications: mine.slice(0, 30), unread: mine.filter((n) => !n.read).length });
}

/** Mark all of the signed-in user's notifications as read. */
export async function POST() {
  const g = await requireUser();
  if ("error" in g) return g.error;
  await mutate((db) => {
    for (const n of db.notifications ?? []) if (n.userId === g.user.id) n.read = true;
  });
  return json({ ok: true });
}
