import { NextResponse } from "next/server";
import { runDailyAlerts } from "@/server/scheduler";

export const dynamic = "force-dynamic";

/** Called by Cloudflare Cron Triggers at 4 PM (?slot=reminder) and 5 PM IST (?slot=deadline). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const slot = new URL(req.url).searchParams.get("slot");
  if (slot !== "reminder" && slot !== "deadline") return NextResponse.json({ error: "slot must be reminder or deadline" }, { status: 400 });
  return NextResponse.json({ slot, status: await runDailyAlerts(slot) });
}
