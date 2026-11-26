/** Next.js calls this once when the server starts. */
export async function register() {
  // On Vercel there is no long-running server; Vercel Cron calls /api/cron/weekly instead.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { startScheduler } = await import("./server/scheduler");
    startScheduler();
  }
}
