import { NextRequest, NextResponse } from "next/server";
import {
  applyAuthResultHeaders,
  gateAuth,
  getAuthConfig,
} from "@/lib/auth";

/**
 * Auth gate for pages + API. Portal owns login; this only accepts identity.
 *
 * - AUTH_REQUIRED=false (default): pass-through; optional user attached
 * - AUTH_REQUIRED=true: reject API with 401 JSON; pages redirect to portal login
 * - AUTH_DEV_BYPASS=true: synthetic local user (demo only)
 */
export async function middleware(req: NextRequest) {
  const config = getAuthConfig();
  const result = await gateAuth(req.headers, config);

  if (!result.ok) {
    const isApi = req.nextUrl.pathname.startsWith("/api/");
    if (isApi) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    // ASSUMPTION: portal login path — verify against C:\projects\portal
    const loginUrl =
      process.env.PORTAL_LOGIN_URL?.trim() || "http://127.0.0.1:3000/login";
    const redirect = new URL(loginUrl);
    redirect.searchParams.set(
      "next",
      req.nextUrl.pathname + req.nextUrl.search
    );
    return NextResponse.redirect(redirect);
  }

  // Rewrite request headers so Route Handlers can read identity without re-parsing JWT
  const requestHeaders = new Headers(req.headers);
  applyAuthResultHeaders(requestHeaders, result.user);

  const res = NextResponse.next({
    request: { headers: requestHeaders },
  });
  applyAuthResultHeaders(res.headers, result.user);
  return res;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets, PWA service worker artifacts, and icons.
     * Manifest stays public so install prompts work before auth on standalone installs;
     * when AUTH_REQUIRED=true the HTML shell still requires auth.
     */
    "/((?!_next/static|_next/image|icons/|favicon.ico|sw\\.js|workbox-.*|swe-worker-.*|manifest\\.webmanifest).*)",
  ],
};
