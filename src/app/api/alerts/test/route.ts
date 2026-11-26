import { fail, json, requireUser } from "@/server/auth";
import { runDailyAlertsReport } from "@/server/scheduler";

export const dynamic = "force-dynamic";

/**
 * Admin "Test now": runs the real 4 PM / 5 PM alert immediately, marked [TEST].
 * Engineers with unchecked nodes today get the actual email + bell notice.
 * Does not use up today's scheduled run.
 */
export async function POST(req: Request) {
  const g = await requireUser("admin");
  if ("error" in g) return g.error;
  const { slot } = await req.json().catch(() => ({}));
  if (slot !== "reminder" && slot !== "deadline") return fail("slot must be reminder or deadline");
  return json(await runDailyAlertsReport(slot, new Date(), { test: true }));
}
