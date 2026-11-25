# 801 — Sentry's tunnel set in the browser and server init: decisions

Renovate's #801 takes `@sentry/nextjs` from 11.12.0 to 11.17.0. 11.17 deprecates the `tunnelRoute` build option and warns about it on every build, and the warning in `tests/unit/next-config.test.ts` failed the unit run, which fails on any stray output. In 11.17 the deprecated option is already the new mechanism underneath: it no longer adds a Next rewrite to Sentry's host, it tells the client and server SDKs the path, and the server answers it.

| Decision | Why |
|---|---|
| **The browser `init` sets `tunnel: { path: "/monitoring" }`, and the server `init` adds `serveTunnelIntegration({ path: "/monitoring" })`**, in place of `tunnelRoute` | What the deprecation warning asks for. The server answers the path on its `node:http` server before Next sees the request, so no route, rewrite or middleware is involved |
| **The path stays `/monitoring`**, in one constant, `TUNNEL_PATH` in `src/lib/platform/sentry-config.ts` | `true` would derive a path from the DSN. A fixed path keeps the CSP's `connect-src 'self'` and its comment true as written (`decisions/808-security-headers.md`), and the constant keeps the browser and server on the same one |
| **The edge `init` is unchanged** | The edge runtime serves no `node:http` requests, so there is nothing for it to answer |
| **`integrations` on the server is an array** | Sentry merges an array with its default integrations rather than replacing them (`getIntegrationsToSetup` in `@sentry/core`), so every default stays |
| **`tests/unit/next-config.test.ts` no longer filters rewrites to other hosts** | That filter removed the rewrite the old `tunnelRoute` added. With none left, the test compares every rewrite |

This overrides the tunnel's setting place in `decisions/808-security-headers.md` (`tunnelRoute: "/monitoring"` in `next.config.ts`). The path, and the reason `connect-src` needs no Sentry host, are unchanged.

## Measured

On 2026-11-23, against a production build (`CI=true npm run build`) started with `next start`, and a stub DSN, `http://publickey@127.0.0.1:3099/1`, whose host was a local server that logged every request, so nothing reached Sentry:

| Sent | Answer | Forwarded to the stub |
|---|---|---|
| An envelope for the server's own DSN, posted to `/monitoring` | 200 | yes, to `/api/1/envelope/` |
| An envelope for another DSN | 403 | no |
| `GET /monitoring` | 404 | no |
| An error thrown in a page, in Chromium | the SDK posted it to `/monitoring` | yes, the same event id, SDK `11.17.0` |

The build printed no Sentry line, and the unit run printed nothing beside its results.
