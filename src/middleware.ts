import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/api/auth", "/api/config", "/api/me", "/api/cron"]; // /api/cron checks CRON_SECRET itself

/** Cheap redirect for signed-out visitors. Real verification happens in every API route. */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!req.cookies.get("fc_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Please sign in" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon.ico|icon.svg).*)"] };
