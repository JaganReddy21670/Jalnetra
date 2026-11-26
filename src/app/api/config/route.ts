import { googleClientId, json, setupCode } from "@/server/auth";
import { readDB } from "@/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await readDB();
  return json({
    googleClientId: await googleClientId(),
    adminExists: db.users.some((u) => u.role === "admin"),
    adminCodeRequired: !!setupCode() || db.users.some((u) => u.role === "admin"),
  });
}
