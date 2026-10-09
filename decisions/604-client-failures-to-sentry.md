# 604 — Failures in client components are reported to Sentry: decisions

Chore #604, split from #538. A client component that caught a failure showed
the reader a Finnish notice and recorded nothing. The browser cannot use the
server's logger.

## Sentry, not an endpoint

Decided by Miikka, 2026-10-09.

| | For | Against |
|---|---|---|
| **Sentry's `captureException`** (chosen) | Sentry already runs in the browser (`src/instrumentation-client.ts`); no new endpoint | Browser failures are in Sentry and the server's record is in Axiom |
| A small endpoint forwarding to the logger | Everything stays in Axiom | A route the browser can post to, with a size limit and rate limiting to maintain |

## The helper

`reportClientError(error, where)` in `src/lib/report-client-error.ts` calls
`Sentry.captureException(error, { tags: { where } })`. Every catch site in a
client component calls it first, then does what it did before. No notice the
reader sees changed.

| Decision | Why |
|---|---|
| One helper, not `Sentry.captureException` at each site | A new catch site has one thing to call, and the destination can change in one place. |
| A `where` tag, a fixed string per site | A rejected server action's message is redacted in production, so the error alone does not say which control failed. The tag does, and Sentry can be filtered by it. |
| Reported before any early return | A failure whose answer is no longer shown (the admin changed competition, a newer search superseded it) still happened. |
| The helper adds nothing about the reader | No `setUser` call exists in the app, and the helper passes only the error and the tag, so no email address is attached by this code. What Sentry itself attaches follows `SENTRY_SEND_DEFAULT_PII` (`docs/infrastructure.md`). |
| A refusal is not reported | An action answering `{ ok: false }` is the server saying no, and the server logs that. Only a rejection or a throw reaches a `catch`. |

## The sites

Measured on `main` at `32e2cd8`: every `catch`, `.catch(` and rejection handler
in a file under `src/` that starts with `"use client"`. Eighteen, in eight
files, where the issue's audit of 2026-10-04 counted sixteen. None is left
silent.

| File | `where` |
|---|---|
| `sign-in-prompt.tsx` | `sign-in.prompt` |
| `auth-controls.tsx` | `sign-in.header`, `sign-out`, `sign-out.notice` |
| `refresh-form.tsx` | `refresh.seasons`, `refresh.request` |
| `settings-page.tsx` | `settings.save`, `settings.save.refetch`, `avatar.save`, `avatar.save.refetch`, `avatar.remove`, `avatar.remove.refetch`, `sessions.sign-out-others`, `account.delete` |
| `admin-user-table.tsx` | `admin.user-write` |
| `favourites-page.tsx` | `favourites.remove` |
| `favourite-toggle.tsx` | `favourite.toggle` |
| `team-search.tsx` | `team-search` |

`src/app/global-error.tsx` already called `Sentry.captureException` and is
unchanged.

## Not established here

No event was seen arriving in Sentry from this change. The unit tests assert
the helper is called at each site and that it calls `captureException`; an
event needs a build with a DSN and a failure in a browser.
