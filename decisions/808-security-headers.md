# 808 — Security headers on every response: decisions

Chore #808. Production sent no security headers: on 2026-11-20,
`https://footy-trends.up.railway.app/` answered with no HSTS, no CSP, no
`X-Frame-Options`, no `Referrer-Policy` and no `Permissions-Policy`, and with
`x-powered-by: Next.js`. Every page could be framed by another site, the admin
area and the settings page among them, which is what clickjacking needs.

| Decision | Why |
|---|---|
| The headers live in `src/lib/security-headers.ts`, and `next.config.ts` hands them to `headers()` for `/:path*` | `next.config.ts` is outside coverage (`sonar-project.properties`), and a header someone drops should fail a test. Every route, the prerendered and cached pages included, gets them from the routes manifest, with no middleware |
| `X-Frame-Options: DENY` carries the framing protection, with `frame-ancestors 'none'` in the CSP as well | A report-only policy enforces nothing, `frame-ancestors` included, so only `X-Frame-Options` blocks framing until the CSP is enforced. Nothing frames this app, so `DENY` rather than `SAMEORIGIN` |
| HSTS for two years, without `includeSubDomains` or `preload` | The host is a name under Railway's `up.railway.app`, and the app speaks for nothing below it. A custom domain would be the time to reconsider |
| The CSP is report-only | Enforcing a policy that has not met real browsers risks blanking a page. Enforcing it is a later decision, once production's reports have been read for a while (#808, Out of scope) |
| `script-src` and `style-src` allow `'unsafe-inline'`, so the policy is no defence against an inline script injection | Next's bootstrap is inline. A nonce, the alternative, has to be new on every response, and the prerendered pages are cached (`s-maxage=31536000`), so they cannot carry one without becoming dynamic. What the policy does catch is any script, style, font or request from another origin, `<object>`, a changed `<base>`, a form posting elsewhere, and framing |
| `'unsafe-eval'` only when `NODE_ENV` is `development` | React's development build evaluates strings for its debugging tools. A production build does not |
| `img-src` allows `data:`, `blob:` and any `https:` host | Crests come from `crests.football-data.org` and from whatever URL a provider stores for a team, and avatars from Google's hosts, which `account-menu.tsx` already calls an arbitrary host. An image cannot run script, so naming every host would buy little and break on the next provider change |
| Reports go to Sentry's security endpoint, built from `NEXT_PUBLIC_SENTRY_DSN` at build time | Sentry takes CSP reports as security events, in the project that already holds the browser's errors. `headers()` is evaluated by `next build`, as the browser's DSN is inlined then, so a build without a DSN, e2e's and CI's (decisions/656), names no endpoint and sends nothing. A DSN that is not `https://<key>@<host>/<project id>` names none either |
| `report-uri`, with no `Reporting-Endpoints` | Every current browser still posts to `report-uri` when no `report-to` is named. One mechanism is one thing to read |
| `Permissions-Policy` turns off camera, microphone, geolocation, payment, USB and topics | Nothing here uses them. The avatar picker is a file input, which needs no permission |
| `poweredByHeader: false` | The header tells a reader nothing and names the framework to anyone probing |

## Measured

On 2026-11-20, against a fresh production build served by the e2e setup with
the TASO stand-in, with a temporary Playwright probe that recorded every
`securitypolicyviolation` event (it fires for a report-only policy too):

| Pages | Reports |
|---|---|
| `/`, `/kotimaa`, its standings, matches and a team page, `/ulkomaat`, its standings and a team page, `/maajoukkueet/huuhkajat`, `/ennusteet`, `/tietosuoja`, a missing page, each scrolled to the bottom | 0 |
| Signed in as an admin with a stored session: `/asetukset`, `/yllapito`, `/yllapito/data`, `/arvauspeli`, `/suosikit`, and an avatar uploaded on `/asetukset` and shown after a reload | 0 |
| The same run with `img-src 'self'` (the control) | 94, every one an external crest |

The probe's first test read the response headers. Every header above was there,
and `x-powered-by` was not.

The real DSN, read from production's browser bundle, gives
`https://o4511499874729984.ingest.de.sentry.io/api/4511977968959568/security/?sentry_key=…`,
and that endpoint answered a POST with 200.

Not measured locally: Google's sign-in round trip, which Google refuses to an
automated browser, and the Sentry SDK sending a real event. Both are checked on
staging.
