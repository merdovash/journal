/**
 * Portal-owned auth integration for Broker Journal.
 *
 * Journal does NOT implement login. It accepts identity from the project_hub
 * portal via cookie JWT, Authorization Bearer, or trusted proxy headers.
 *
 * ASSUMPTIONS (verify against C:\projects\portal when available):
 * - Cookie name defaults to `portal_session` (override with AUTH_COOKIE_NAME)
 * - JWT is HS256, signed with a secret shared with portal (AUTH_JWT_SECRET)
 * - Claims include at least `sub` (user id); optional `email`, `name`, `role`
 * - When portal reverse-proxies, it may also set:
 *     x-portal-user-id, x-portal-user-email, x-portal-user-name
 *   gated by matching x-portal-auth-secret === AUTH_PROXY_SECRET
 */

export type PortalUser = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  source: "jwt" | "proxy-headers" | "dev-bypass";
};

export type AuthConfig = {
  /** When true, unauthenticated requests are rejected (401/redirect). */
  required: boolean;
  /** Local demo only — never enable in production. */
  devBypass: boolean;
  cookieName: string;
  jwtSecret: string | undefined;
  trustProxyHeaders: boolean;
  proxySecret: string | undefined;
};

export const AUTH_HEADER_USER_ID = "x-portal-user-id";
export const AUTH_HEADER_USER_EMAIL = "x-portal-user-email";
export const AUTH_HEADER_USER_NAME = "x-portal-user-name";
export const AUTH_HEADER_PROXY_SECRET = "x-portal-auth-secret";

/** Response header set by middleware so route handlers can read identity cheaply. */
export const AUTH_RESULT_USER_ID = "x-bj-user-id";
export const AUTH_RESULT_USER_EMAIL = "x-bj-user-email";
export const AUTH_RESULT_USER_NAME = "x-bj-user-name";
export const AUTH_RESULT_SOURCE = "x-bj-auth-source";

export function getAuthConfig(): AuthConfig {
  return {
    required: parseBool(process.env.AUTH_REQUIRED, false),
    devBypass: parseBool(process.env.AUTH_DEV_BYPASS, false),
    // ASSUMPTION: align with portal session cookie name after reading portal source
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || "portal_session",
    jwtSecret: process.env.AUTH_JWT_SECRET?.trim() || undefined,
    trustProxyHeaders: parseBool(process.env.AUTH_TRUST_PROXY_HEADERS, false),
    proxySecret: process.env.AUTH_PROXY_SECRET?.trim() || undefined,
  };
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function b64urlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const buffer = new ArrayBuffer(binary.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToJson<T>(bytes: Uint8Array): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

type JwtPayload = {
  sub?: string;
  email?: string;
  name?: string;
  role?: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
};

/**
 * Verify HS256 JWT with Web Crypto (Edge + Node compatible).
 * Returns null if invalid / expired / missing secret.
 */
export async function verifyHs256Jwt(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;

  try {
    const header = bytesToJson<{ alg?: string; typ?: string }>(
      b64urlToBytes(headerB64)
    );
    if (header.alg !== "HS256") return null;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = b64urlToBytes(sigB64);
    const ok = await crypto.subtle.verify("HMAC", key, signature, data);
    if (!ok) return null;

    const payload = bytesToJson<JwtPayload>(b64urlToBytes(payloadB64));
    if (typeof payload.exp === "number" && payload.exp * 1000 < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function userFromJwt(payload: JwtPayload): PortalUser | null {
  const id =
    (typeof payload.sub === "string" && payload.sub) ||
    (typeof payload.userId === "string" && payload.userId) ||
    (typeof payload.id === "string" && payload.id) ||
    "";
  if (!id) return null;
  return {
    id,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    role: typeof payload.role === "string" ? payload.role : undefined,
    source: "jwt",
  };
}

function getCookieValue(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function getHeader(
  headers: Headers,
  name: string
): string | null {
  const v = headers.get(name);
  return v && v.trim() ? v.trim() : null;
}

/**
 * Resolve portal user from a request. Does not enforce AUTH_REQUIRED.
 */
export async function resolvePortalUser(
  headers: Headers,
  config: AuthConfig = getAuthConfig()
): Promise<PortalUser | null> {
  if (config.devBypass) {
    return {
      id: process.env.AUTH_DEV_USER_ID?.trim() || "dev-user",
      email: process.env.AUTH_DEV_USER_EMAIL?.trim() || "dev@localhost",
      name: process.env.AUTH_DEV_USER_NAME?.trim() || "Dev User",
      role: "dev",
      source: "dev-bypass",
    };
  }

  // 1) Trusted proxy headers (portal → journal reverse proxy)
  if (config.trustProxyHeaders && config.proxySecret) {
    const secret = getHeader(headers, AUTH_HEADER_PROXY_SECRET);
    const userId = getHeader(headers, AUTH_HEADER_USER_ID);
    if (secret && userId && timingSafeEqualStr(secret, config.proxySecret)) {
      return {
        id: userId,
        email: getHeader(headers, AUTH_HEADER_USER_EMAIL) ?? undefined,
        name: getHeader(headers, AUTH_HEADER_USER_NAME) ?? undefined,
        source: "proxy-headers",
      };
    }
  }

  // 2) Authorization: Bearer <jwt>
  if (config.jwtSecret) {
    const authz = getHeader(headers, "authorization");
    if (authz?.toLowerCase().startsWith("bearer ")) {
      const token = authz.slice(7).trim();
      const payload = await verifyHs256Jwt(token, config.jwtSecret);
      const user = payload ? userFromJwt(payload) : null;
      if (user) return user;
    }

    // 3) Session cookie JWT (ASSUMPTION: portal stores JWT in cookie)
    const cookieToken = getCookieValue(
      headers.get("cookie"),
      config.cookieName
    );
    if (cookieToken) {
      const payload = await verifyHs256Jwt(cookieToken, config.jwtSecret);
      const user = payload ? userFromJwt(payload) : null;
      if (user) return user;
    }
  }

  return null;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export type AuthGateResult =
  | { ok: true; user: PortalUser | null }
  | { ok: false; status: 401; error: string };

/**
 * Enforce auth for API / page requests based on AUTH_REQUIRED.
 * When not required, still returns resolved user if present.
 */
export async function gateAuth(
  headers: Headers,
  config: AuthConfig = getAuthConfig()
): Promise<AuthGateResult> {
  const user = await resolvePortalUser(headers, config);
  if (!config.required) {
    return { ok: true, user };
  }
  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Требуется авторизация через portal",
    };
  }
  return { ok: true, user };
}

/** Attach resolved user onto response headers for downstream handlers. */
export function applyAuthResultHeaders(
  headers: Headers,
  user: PortalUser | null
): void {
  if (!user) return;
  headers.set(AUTH_RESULT_USER_ID, user.id);
  if (user.email) headers.set(AUTH_RESULT_USER_EMAIL, user.email);
  if (user.name) headers.set(AUTH_RESULT_USER_NAME, user.name);
  headers.set(AUTH_RESULT_SOURCE, user.source);
}

/** Read user previously stamped by middleware (or re-resolve). */
export async function getRequestUser(headers: Headers): Promise<PortalUser | null> {
  const stampedId = getHeader(headers, AUTH_RESULT_USER_ID);
  if (stampedId) {
    return {
      id: stampedId,
      email: getHeader(headers, AUTH_RESULT_USER_EMAIL) ?? undefined,
      name: getHeader(headers, AUTH_RESULT_USER_NAME) ?? undefined,
      source: (getHeader(headers, AUTH_RESULT_SOURCE) as PortalUser["source"]) || "jwt",
    };
  }
  return resolvePortalUser(headers);
}

/**
 * Helper for Route Handlers: reject with 401 JSON when AUTH_REQUIRED and no user.
 */
export async function requireApiUser(
  headers: Headers
): Promise<{ user: PortalUser | null; unauthorized?: Response }> {
  const result = await gateAuth(headers);
  if (!result.ok) {
    return {
      user: null,
      unauthorized: new Response(JSON.stringify({ error: result.error }), {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    };
  }
  return { user: result.user };
}
