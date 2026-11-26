import { NextResponse } from "next/server";
import { runWeeklyIfDue } from "@/server/scheduler";

export const dynamic = "force-dynamic";

/** Called daily by Vercel Cron (see vercel.json). Protected by CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const status = await runWeeklyIfDue({ ignoreTime: true });
  return NextResponse.json({ status });
}
