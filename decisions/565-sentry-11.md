# 565 — `@sentry/nextjs` 11, with what an event carries stated in full: decisions

Chore #565. Renovate's bump to 11 (#550) changed only the package files;
merged as it stood it would have changed what personal data reaches Sentry,
because v11 removes `sendDefaultPii` and collects every category it is not told
to leave out. The investigation and the decisions are on the issue
(2026-10-14). This record overrides decisions/140 on `sendDefaultPii`,
`enableLogs` and `flagFrom`; its sample-rate parsing stands.

## What an event may carry

`DATA_COLLECTION` in `src/lib/sentry-config.ts`, passed by all three runtimes
and by `scripts/verify-sentry.ts`. Decided by Miikka, 2026-10-14.

| Category | Setting | Why |
|---|---|---|
| `userInfo` | `false` | No IP address, as v10 with `sendDefaultPii: false` |
| `cookies` | `false` | v10's "off" mapping kept cookies, and production's events carried the session cookie (Measured) |
| `httpHeaders` | request and response deny `DENIED_NAME_PARTS` | v10's five address and proxy parts, plus `cookie`, `auth`, `token`, `session`, `secret`, `key`: the `Authorization` header reached Sentry too. And `referer`: a page URL's query can hold a credential, and an error event's headers pass through no query filter |
| `urlQueryParams` | deny `DENIED_NAME_PARTS` | The same names, in a query. `password`, `passwd`, and the OAuth callback's `code` and `state` are on the list too: Google's callback, `/api/auth/callback/google`, carries both in its query |
| `httpBodies` | `[]` | v10 sent none |
| `databaseQueryData`, `genAI`, `queues` | off | v10 sent none. `queues` is new in v11 and not in its migration guide; the type check found it |
| `graphQL`, `stackFrameVariables`, `frameContextLines` | as v10: on, on, `7` | No change was decided |

| Decision | Why |
|---|---|
| One constant for every environment, no variable | Staging read `sendDefaultPii` as `true` when unset and sent everything. Its readers are the developers, and no user id is attached anywhere, so it loses nothing useful. Four variables go. |
| Every category stated, checked by `satisfies Required<…>` | An omitted category falls back to v11's default, which collects. A category Sentry adds fails the type check, as `queues` did. |
| Cookies off and credential names denied: less than v10 sent | Miikka, 2026-10-14: "Stop it". Keeping v10 exactly would have carried the session token into v11. |
| `enableLogs` removed, with nothing in its place | In v10 it acted only through `Sentry.logger`, `consoleLoggingIntegration` or `pinoIntegration`. The app uses none, and Pino's integration is not a default, so no log ever reached Sentry. |
| v11's span streaming kept | `traceLifecycle: 'static'` is temporary and goes in v12. `tracesSampleRate` still applies. No Sentry alert or dashboard reads transactions. |
| v11's `attachStacktrace` kept | It changes `captureMessage`, which the app does not call, and non-`Error` values passed to `captureException`, which gain a stack. |
| `beforeSendSpan: filterSpanQueries`, in all three runtimes | Sentry filters the query it extracts (`url.full`, `url.query`, an event's `request`) but not the raw URL that `http.target` and the referer header keep on a span, so a sampled OAuth callback sent its `code` in clear. The filter applies the deny list to every string attribute and the span's name, so an attribute not yet seen is covered too. Each name is matched percent-decoded, a name with a malformed escape by its valid escapes alone. Found by Sourcery on the pull request. |
| The `@sentry/cli` install-script allowance removed | v11 no longer depends on it. Nothing uploads source maps: no `SENTRY_AUTH_TOKEN` is set anywhere. |

## Measured

A production build run locally, with production's sample rate and PII settings,
a DSN at a fake ingest on `127.0.0.1`, and three probes deleted afterwards: a
server page that throws, a route handler that throws on a JSON body, and a
client page calling `captureException`. Each request carried
`Cookie: theme=dark; better-auth.session_token=…`, `X-Forwarded-For`,
`X-Real-IP`, `Authorization: Bearer …`, a harmless `X-Probe` header and a query
with `email` and `token`; the body carried a `password`. Every envelope was
searched for each value.

| Value | `main`, v10.76.2 | This change on v10 | This change on v11.7.0 |
|---|---|---|---|
| Session cookie | errors and transactions, in clear | none | none |
| `Authorization` | errors and transactions, in clear | errors and transactions, in clear | `[Filtered]` |
| IP address, forwarding headers | none | none | none (`x-forwarded-*` `[Filtered]`) |
| Request body | none | none | none |
| Query `token` | `[Filtered]` on errors; in clear in transactions' `http.target` and referer | the same | `[Filtered]` on errors; in clear in spans' `http.target` and referer |
| `user` | `null` | `null` | `null` |
| Error events, server and browser | 4 | 4 | 4 |

v10 applies the header deny list to span attributes only: on an error event it
removes the cookie header and the IP headers and nothing else, which is why
`Authorization` survived the first step. The query value in `http.target` was
the same before and after: `filterSpanQueries` closes it (the table above).
Re-run with it on v11.7.0, the query also carrying the OAuth callback's `code`
and `state` and a `password`: none of `token`, `code`, `state` or `password`
appears anywhere in what was sent, events, breadcrumbs or spans; `email`, not a
denied name, still does. The edge runtime was not measured: the app has no middleware and no edge
route, so nothing runs there.

## Release step

**Apply `.railway/railway.ts` to production only after the release carrying
this change has deployed.** The apply removes `SENTRY_SEND_DEFAULT_PII`,
`SENTRY_ENABLE_LOGS` and their `NEXT_PUBLIC_` copies, and the code on `release`
until then reads an unset `SENTRY_SEND_DEFAULT_PII` as `true`. Staging holds
none of the four, so it has nothing to apply.
