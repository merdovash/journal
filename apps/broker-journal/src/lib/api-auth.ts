import { NextRequest, NextResponse } from "next/server";
import { requireApiUser, type PortalUser } from "@/lib/auth";

/**
 * Defense-in-depth for Route Handlers (middleware is the primary gate).
 * Returns an unauthorized NextResponse when AUTH_REQUIRED and no user.
 */
export async function ensureApiAuth(
  req: NextRequest
): Promise<{ user: PortalUser | null; error: NextResponse | null }> {
  const { user, unauthorized } = await requireApiUser(req.headers);
  if (unauthorized) {
    return {
      user: null,
      error: new NextResponse(unauthorized.body, {
        status: unauthorized.status,
        headers: unauthorized.headers,
      }),
    };
  }
  return { user, error: null };
}
