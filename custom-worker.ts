// Cloudflare entry point: the Next.js app (built by OpenNext) plus the Cron Triggers.
// @ts-expect-error: generated at build time by `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
}

/** Which app route each cron schedule (UTC, see wrangler.jsonc) calls. */
const CRON_ROUTES: Record<string, string> = {
  "30 3 * * *": "/api/cron/weekly", // 09:00 IST: weekly summary (on the chosen day)
  "30 10 * * *": "/api/cron/daily?slot=reminder", // 16:00 IST: reminder to engineers with unchecked nodes
  "30 11 * * *": "/api/cron/daily?slot=deadline", // 17:00 IST: missed notices + escalation to admins
};

export default {
  fetch: handler.fetch,

  async scheduled(event: { cron: string }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const path = CRON_ROUTES[event.cron];
    if (!path) return;
    const req = new Request(`https://jalnetra.internal${path}`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    ctx.waitUntil(handler.fetch(req, env, ctx));
  },
};
