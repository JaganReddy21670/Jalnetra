/**
 * JalNetra relay on Cloudflare Pages (https://jalnetra.pages.dev).
 * Forwards every request to the Vercel app and rewrites redirects back to this host,
 * so users never need to reach *.vercel.app (blocked on some networks).
 */
const ORIGIN = "https://jalnetra-dun.vercel.app";

export default {
  async fetch(request) {
    const origin = new URL(ORIGIN);
    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, origin);

    const headers = new Headers(request.headers);
    headers.delete("host");
    headers.set("x-forwarded-host", incoming.host);
    headers.set("x-forwarded-proto", "https");

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      redirect: "manual",
    });

    const response = new Response(upstream.body, upstream);
    const location = response.headers.get("location");
    if (location) {
      const loc = new URL(location, origin);
      if (loc.host === origin.host) {
        loc.protocol = incoming.protocol;
        loc.host = incoming.host;
        response.headers.set("location", loc.toString());
      }
    }
    return response;
  },
};
