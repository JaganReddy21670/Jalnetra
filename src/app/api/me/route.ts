import { currentUser, json, toPublic } from "@/server/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  return json({ user: u ? toPublic(u) : null });
}
