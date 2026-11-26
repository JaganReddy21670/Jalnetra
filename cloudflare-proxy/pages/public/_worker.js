/**
 * https://jalnetra.pages.dev → the JalNetra app Worker (jalnetra-app).
 * Uses a Cloudflare service binding, so requests stay inside Cloudflare.
 * The app sees the original pages.dev URL, so cookies and redirects just work.
 */
export default {
  async fetch(request, env) {
    return env.APP.fetch(request);
  },
};
