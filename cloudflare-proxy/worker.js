/**
 * JalNetra relay: forwards every request to the Vercel app and sends the answer back,
 * so users never need to reach *.vercel.app directly.
 * - Keeps method, body, headers and cookies (sign-in works normally)
 * - Rewrites redirects that point at the Vercel host back to this host
 */
export default {
  async fetch(request, env) {
    const origin = new URL(env.ORIGIN);
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
    // Cookies from the app have no Domain attribute, so they attach to this host automatically.
    return response;
  },
};
