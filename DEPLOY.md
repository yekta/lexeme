# Deploying

Three hosts, one registrable domain between them. The domain is not a
convenience: the session cookie has to be visible to all three, and that only
works if they are sibling subdomains of one registrable name.

```
lexeme.fyi         apps/web      Cloudflare Pages (static)
api.lexeme.fyi     apps/server   Railway
zero.lexeme.fyi    zero-cache    Railway
                   Postgres      Railway
```

A `*.up.railway.app` or `*.pages.dev` hostname will **not** do for this: those
are separate sites, not subdomains of a shared registrable domain, so a cookie
issued for one is invisible to the others and sync 401s on every request. Put
custom domains on all three before setting `COOKIE_DOMAIN`.

## apps/web → Cloudflare Pages

| Setting | Value |
| --- | --- |
| Build command | `pnpm install && pnpm --filter @lexeme/web build` |
| Build output directory | `apps/web/dist` |
| Root directory | (repo root) |

Build-time variables — these are baked into the bundle, so nothing secret:

```
VITE_API_URL=https://api.lexeme.fyi
VITE_ZERO_CACHE_URL=https://zero.lexeme.fyi
```

`public/_redirects` is the SPA fallback: every screen is a real path matched in
the browser, so a hard refresh on `/deck/<id>` has to be answered with
`index.html` and a 200. `public/_headers` carries the cross-origin isolation
headers the FSRS optimizer needs. Both are copied into `dist` by the build;
Pages reads them from there.

## apps/server → Railway

| Setting | Value |
| --- | --- |
| Build command | `pnpm install && pnpm --filter @lexeme/server build` |
| Start command | `pnpm --filter @lexeme/server start` |
| Health check path | `/health` |

Variables:

```
DATABASE_URL=            # the Railway Postgres, private URL
BETTER_AUTH_URL=https://api.lexeme.fyi
BETTER_AUTH_SECRET=      # openssl rand -base64 32
WEB_ORIGIN=https://lexeme.fyi
COOKIE_DOMAIN=.lexeme.fyi
GOOGLE_AUTH_CLIENT_ID=
GOOGLE_AUTH_CLIENT_SECRET=
ANTHROPIC_API_KEY=
```

Pending drizzle migrations are applied at boot, before the server listens —
the deploy that ships a schema change and the process that needs it are the same
deploy. Nothing to configure, and a restart with nothing pending is a no-op.

In Google Cloud, the authorized redirect URI is
`https://api.lexeme.fyi/api/auth/callback/google`. It points at the API, not the
app: Better Auth handles the callback and then sends the browser back to
`WEB_ORIGIN`, which it will only do because `WEB_ORIGIN` is in its trusted
origins.

## zero-cache → Railway

Runs `@rocicorp/zero`'s `zero-cache` against the same Postgres, and calls back
into the API to authorize reads and apply writes:

```
ZERO_UPSTREAM_DB=                # same DATABASE_URL
ZERO_APP_PUBLICATIONS=zero_data  # created by packages/db/drizzle/0003
ZERO_GET_QUERIES_URL=https://api.lexeme.fyi/api/zero/query
ZERO_PUSH_URL=https://api.lexeme.fyi/api/zero/mutate
ZERO_GET_QUERIES_FORWARD_COOKIES=true
ZERO_PUSH_FORWARD_COOKIES=true
```

The two `FORWARD_COOKIES` flags are how sync authenticates: zero-cache passes
the browser's session cookie through to those endpoints, which resolve it into a
user id. That is the whole reason `COOKIE_DOMAIN` exists.

Postgres needs `wal_level=logical` for replication.

## After a deploy, check three things

1. `crossOriginIsolated` is `true` in the console on the app. If it is false the
   `_headers` file is not being served and auto-calibration will never run.
2. Signing in works end to end, and a reload keeps you signed in — that proves
   the cookie is visible on both the app and the API.
3. A write made in one tab appears in another. That proves zero-cache can reach
   `/api/zero/mutate` *with* the cookie; if it cannot, writes stay local
   forever and the app shows the "syncing was refused" banner rather than
   failing loudly.

## What this replaced

The whole app used to be one TanStack Start deployment on Cloudflare Workers:
server routes and browser bundle in a single Worker, tRPC between them, Postgres
over `cloudflare:sockets`. Three things that Worker forced are gone with it — a
database client rebuilt per request (workerd binds sockets to the request that
opened them), a lazily-validated environment (`process.env` is empty at module
scope there), and `keep_vars`/`deployConfig` workarounds to stop each deploy
wiping the dashboard's variables.
