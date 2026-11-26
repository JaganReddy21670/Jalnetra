// Cloudflare entry point: the Next.js app (built by OpenNext) plus the daily Cron Trigger.
// @ts-expect-error: generated at build time by `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";

interface Env {
  CRON_SECRET?: string;
}

export default {
  fetch: handler.fetch,

  /** Daily cron: asks the app to send the weekly summary if today is the chosen day. */
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    const req = new Request("https://jalnetra.internal/api/cron/weekly", {
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ""}` },
    });
    ctx.waitUntil(handler.fetch(req, env, ctx));
  },
};
