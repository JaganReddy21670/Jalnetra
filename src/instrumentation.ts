/** Next.js calls this once when the server starts. */
export async function register() {
  // On Cloudflare there is no long-running server; a Cron Trigger calls /api/cron/weekly instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.STORAGE !== "d1" && !process.env.VERCEL) {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
