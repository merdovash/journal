import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig, getRequestUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Identity probe for portal integration debugging.
 * Returns current user (or null) and whether AUTH_REQUIRED is on.
 * Still gated by middleware when AUTH_REQUIRED=true.
 */
export async function GET(req: NextRequest) {
  const config = getAuthConfig();
  const user = await getRequestUser(req.headers);
  return NextResponse.json({
    authenticated: Boolean(user),
    user,
    auth: {
      required: config.required,
      devBypass: config.devBypass,
      cookieName: config.cookieName,
      jwtConfigured: Boolean(config.jwtSecret),
      trustProxyHeaders: config.trustProxyHeaders,
    },
  });
}
