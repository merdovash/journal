# Portal integration — Broker Journal ↔ project_hub

Portal source (`C:\projects\portal`) is **not available** in this cloud VM. Everything below marked **ASSUMPTION** must be verified against the real portal once a Worker can read that path.

## Chosen approach: reverse-proxy path mount

**Prefer reverse proxy / Next.js rewrites under `/broker`**, not iframe and not a second auth system.

| Option | Verdict |
|--------|---------|
| **Reverse proxy / rewrites to journal** (`/broker/*` → journal) | **Chosen.** Shared cookie domain works; portal keeps login; journal uses `basePath=/broker`. |
| Shared package import into portal | Possible later for UI only; journal has its own API + Prisma — do not fold the whole app into portal now. |
| iframe embed | Fallback only. Cookies/`SameSite`, CSP `frame-ancestors`, and PWA install are painful. |

Flow:

1. User authenticates in **portal** (project_hub).
2. Portal serves a nav section “Журнал брокера” → `/broker` (or iframe URL).
3. Requests to `/broker/*` are proxied to the journal Next.js process (same host/cookie domain in prod).
4. Journal **middleware + API helpers** accept portal identity; reject when `AUTH_REQUIRED=true` and no valid session.

```
Browser ──(cookie / JWT)──► portal (auth owner)
                              │
                              ├─ /           portal UI
                              └─ /broker/*  ──proxy──► broker-journal (:43127)
                                                         middleware gate
                                                         /api/* CRUD + candles
```

## How portal should mount the journal

### A. Production / local same-origin (recommended)

In portal `next.config` (or nginx / Caddy):

```js
// ASSUMPTION: portal is Next.js — adjust if it uses a different proxy layer
async rewrites() {
  return [
    {
      source: "/broker",
      destination: "http://127.0.0.1:43127/broker",
    },
    {
      source: "/broker/:path*",
      destination: "http://127.0.0.1:43127/broker/:path*",
    },
  ];
}
```

Journal env for that mount:

```env
NEXT_PUBLIC_BASE_PATH=/broker
AUTH_REQUIRED=true
AUTH_COOKIE_NAME=portal_session          # ASSUMPTION — verify
AUTH_JWT_SECRET=<same secret as portal>  # ASSUMPTION — verify
PORTAL_LOGIN_URL=http://127.0.0.1:3000/login  # ASSUMPTION — verify path
```

Rebuild journal after changing `NEXT_PUBLIC_BASE_PATH` (`pnpm build`).

Portal nav link: `/broker` (not a separate origin).

Optional: when proxying, portal middleware can inject trusted headers (see Auth contract).

### B. iframe fallback (only if rewrite is blocked)

```tsx
// ASSUMPTION: portal page component
<iframe
  title="Журнал брокера"
  src={process.env.NEXT_PUBLIC_BROKER_JOURNAL_URL || "http://127.0.0.1:43127"}
  className="h-full w-full border-0"
  allow="clipboard-read; clipboard-write"
/>
```

Requirements for iframe:

- Portal and journal must share a parent cookie domain **or** portal must pass `Authorization: Bearer` via a postMessage → journal handshake (not implemented yet — TODO).
- Set CSP `frame-ancestors` on journal to allow portal origin (TODO after reading portal origin).
- PWA “Install” from inside iframe is unreliable; prefer standalone install on journal origin.

### C. Shared package (UI only, future)

`@broker-journal/ui` can be imported by portal/wallet. The journal **app** stays a separate Next process for API + Prisma.

## Auth contract

Journal does **not** render login UI. Identity comes from portal.

### Modes

| Env | Behavior |
|-----|----------|
| `AUTH_REQUIRED` unset / `false` | Open access (current local demo default). User resolved if present. |
| `AUTH_REQUIRED=true` | API → `401` JSON; pages → redirect to `PORTAL_LOGIN_URL?next=…` |
| `AUTH_DEV_BYPASS=true` | Synthetic user (`AUTH_DEV_USER_*`). **Never in production.** |

### Identity sources (checked in order)

1. **Dev bypass** when `AUTH_DEV_BYPASS=true`
2. **Trusted proxy headers** when `AUTH_TRUST_PROXY_HEADERS=true` and `x-portal-auth-secret` matches `AUTH_PROXY_SECRET`:
   - `x-portal-user-id` (required)
   - `x-portal-user-email` (optional)
   - `x-portal-user-name` (optional)
3. **`Authorization: Bearer <JWT>`** verified HS256 with `AUTH_JWT_SECRET`
4. **Cookie** named `AUTH_COOKIE_NAME` (default **`portal_session`**) containing the same HS256 JWT

### JWT claims — ASSUMPTIONS

| Claim | Required | Notes |
|-------|----------|-------|
| `sub` | yes | User id (also accepts `userId` / `id`) |
| `email` | no | |
| `name` | no | |
| `role` | no | |
| `exp` | recommended | Rejected if expired |

**TODO (verify against portal):** actual cookie name, JWT algorithm (must be HS256 for current helper), claim names, session vs opaque cookie. If portal uses opaque session cookies (NextAuth DB sessions, iron-session, etc.), either:

- switch portal proxy to inject `x-portal-user-*` headers after resolving the session, **or**
- extend `src/lib/auth.ts` to call portal’s session introspection endpoint (not built yet).

### Probe endpoint

`GET /api/auth/me` (under basePath: `/broker/api/auth/me`) returns:

```json
{
  "authenticated": true,
  "user": { "id": "…", "email": "…", "name": "…", "source": "jwt" },
  "auth": {
    "required": true,
    "devBypass": false,
    "cookieName": "portal_session",
    "jwtConfigured": true,
    "trustProxyHeaders": false
  }
}
```

## Required env vars

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `DATABASE_URL` | yes | — | Postgres |
| `AUTH_REQUIRED` | no | `false` | Enforce portal auth |
| `AUTH_DEV_BYPASS` | no | `false` | Local demo user |
| `AUTH_DEV_USER_ID` | no | `dev-user` | Bypass identity |
| `AUTH_DEV_USER_EMAIL` | no | `dev@localhost` | |
| `AUTH_DEV_USER_NAME` | no | `Dev User` | |
| `AUTH_COOKIE_NAME` | no | `portal_session` | **ASSUMPTION** |
| `AUTH_JWT_SECRET` | when JWT/cookie | — | Shared HS256 secret |
| `AUTH_TRUST_PROXY_HEADERS` | no | `false` | Accept `x-portal-user-*` |
| `AUTH_PROXY_SECRET` | if trust headers | — | Must match `x-portal-auth-secret` |
| `PORTAL_LOGIN_URL` | when required | `http://127.0.0.1:3000/login` | **ASSUMPTION** redirect target |
| `NEXT_PUBLIC_BASE_PATH` | for `/broker` mount | `""` | e.g. `/broker` |
| `NEXT_PUBLIC_ASSET_PREFIX` | optional | unset | CDN / absolute asset host |

Copy from repo root `.env.example` into `apps/broker-journal/.env`.

## Steps to wire `C:\projects\portal` (when readable)

1. Open portal repo; find auth (NextAuth / custom JWT / iron-session / Lucia / …).
2. Record real **cookie name**, **JWT secret env**, **login path**, **user id claim**.
3. Update journal env to match; remove ASSUMPTION defaults if different.
4. If session is opaque: add portal middleware that sets `x-portal-user-id` + `x-portal-auth-secret` on proxied `/broker` requests; set `AUTH_TRUST_PROXY_HEADERS=true` on journal.
5. Add portal rewrite/proxy to journal (`43127` in dev).
6. Set journal `NEXT_PUBLIC_BASE_PATH=/broker` and rebuild.
7. Add portal nav item → `/broker`.
8. Smoke-test: login in portal → open `/broker` → `GET /broker/api/auth/me` shows user → CRUD works; logged-out → `401` / redirect.
9. Confirm cookie `Domain` / `SameSite` / `Secure` work across portal host and journal proxy path.
10. **TODO:** align CSP / CORS if journal is ever cross-origin.

## PWA: standalone vs embedded

| Mode | Behavior |
|------|----------|
| **Standalone** (`/` or `/broker` as installable origin) | Manifest + SW work. Online-first API. Install from Chrome/Edge on journal URL. |
| **Embedded via reverse proxy** | Same origin as portal → one SW scope under `/broker/` when `basePath` set. Prefer installing journal as its own PWA URL if portal SW already claims `/`. |
| **iframe** | Install prompt usually unavailable; SW may not register inside cross-origin iframe. Use standalone URL for PWA. |

Caveats:

- Changing `NEXT_PUBLIC_BASE_PATH` changes SW scope — clear old SW when remounting.
- Dev mode disables SW (`next-pwa` `disable` in development).
- Auth-required pages redirect to portal login; `manifest.webmanifest` stays public so install metadata remains reachable.

## Code map

| Path | Role |
|------|------|
| `apps/broker-journal/src/lib/auth.ts` | Resolve JWT / cookie / proxy headers; gate |
| `apps/broker-journal/src/lib/api-auth.ts` | Route-handler helper |
| `apps/broker-journal/src/middleware.ts` | Edge gate for pages + API |
| `apps/broker-journal/src/app/api/auth/me/route.ts` | Identity probe |
| `apps/broker-journal/next.config.ts` | `basePath` / `assetPrefix` / PWA scope |

## Explicit TODOs after portal source is available

- [ ] Confirm cookie name vs `portal_session`
- [ ] Confirm JWT alg/secret/claims (or switch to header injection only)
- [ ] Confirm login URL path
- [ ] Confirm portal rewrite vs external reverse proxy
- [ ] Set `frame-ancestors` / CSP if iframe is required
- [ ] Decide single SW owner when portal and journal share a host
