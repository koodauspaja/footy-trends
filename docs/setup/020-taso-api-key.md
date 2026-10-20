# 020 — TASO API key (Veikkausliiga data)

## Goal
Obtain the TASO (`spl.torneopal.net/taso/rest/`) API key used to fetch
Veikkausliiga data, and the salt that signs each request (Step 3b), and store
them as Railway environment variables. Unlike
`FOOTBALL_DATA_API_KEY`, there is no registration flow — the key is scraped
from the real tulospalvelu.palloliitto.fi frontend's own network requests.
See specs/009-veikkausliiga.md.

---

## Step 1 — Scrape the key

1. Open https://tulospalvelu.palloliitto.fi/ in a browser.
2. Open devtools → Network tab, filter by `taso/rest`.
3. Navigate to any Veikkausliiga standings or match list on the site to
   trigger a `getGroups` or `getMatches` request.
4. Click the request, inspect its request headers.
5. Copy the `Accept` header's value — it is `json/<KEY>`. The part after
   `json/` is the key.

---

## Step 2 — Required headers

TASO 403s any request missing headers matching the real frontend — this is
server-side origin validation, not browser-enforced CORS, so it applies to
every server-to-server request too:

| Header | Value |
|--------|-------|
| `Accept` | `json/<TASO_API_KEY>` |
| `Referer` | `https://tulospalvelu.palloliitto.fi/` |
| `Origin` | `https://tulospalvelu.palloliitto.fi` |
| `User-Agent` | A real desktop browser UA string |

`Referer`/`Origin`/`User-Agent` are fixed constants in `src/lib/taso.ts`,
not secrets — the key and the signing salt (Step 3b) need environment variables.

---

## Step 3 — Store the key in Railway

1. Go to Railway → `staging` → app service → **Variables** tab (production
   shares the same key: 021)
2. Click **+ New Variable**
3. Name: `TASO_API_KEY`
4. Value: paste the scraped key
5. Save — Railway will redeploy automatically

---

## Step 3b — Store the signing salt

Since 2026-10-15 TASO also checks a `hash` on each request, which its frontend
computes from a salt in its own bundle.

1. Store the salt as `TASO_HASH_SALT`, beside the key: Railway's web service in
   each environment, the `predictions` service (024), and your local `.env`
2. Blank or absent sends requests unsigned

Temporary, until official access: decisions/681.

---

## Step 4 — Store the key locally for development

Add to your local `.env` (not committed):

```
TASO_API_KEY=your_scraped_key_here
```

`.env.example` already documents the variable name with an empty value.

---

## Re-scraping when the key stops working

The key is scraped, not a registered credential, so it can rotate or expire
without notice. So can the signing salt (Step 3b), which lives in the same
frontend bundle.

### How you find out

**A scheduled check asks production every day** —
`.github/workflows/taso-key-check.yml`, added by #113. It calls production's
`/api/health?providers=1`, which makes a real TASO request with production's own
key, and fails the workflow if the answer is anything but `ok`. A red scheduled
workflow emails repo watchers, the same as a failed CI run.

It deliberately holds no key of its own: a copy in Actions secrets could pass
while production's failed, which is the one thing this must not do.

Nothing else would notice quickly. Pages backed by stored rows keep serving, so
the site looks healthy while the current season quietly stops updating — the
failure is silent by nature, which is why it needed a check rather than
attention.

The check covers **both** of TASO's failure shapes, because only one of them
throws:

| Failure | What you see |
|---|---|
| Stale or missing key | Cloudflare returns **403** with an HTML block page, before TASO's app sees it |
| Missing, stale or rotated salt | **403** with an empty body (measured 2026-10-15 and 2026-10-20, decisions/681) |
| Valid key, bad request | TASO returns **200** with `{"call":{"status":"error"}}` — parses fine, contains no usable season |

The second reported healthy until #113: the probe awaited the season and never
looked at it, so a response with no data at all passed.

### Recovering

1. Read the workflow run's output. It prints the health body, which is where
   the reason is.
2. **A 403 is a "go look", not a verdict.** It is Cloudflare's bot management
   deciding to block, which may mean a stale key — or their WAF reacting to
   something else entirely, such as IP reputation. Re-keying does not fix the
   second, and doing it reflexively hides it.
3. An empty 403 points at the salt: check `TASO_HASH_SALT` is set on the web
   and `predictions` services, then compare it with the one the live site's
   bundle signs with (Step 3b), and update it as the key below.
4. If the key is the cause, repeat Step 1 against the live site and update the
   Railway variable in **both** environments — the key is shared between
   staging and production (`021-production-environment.md`), so a rotation
   breaks both at once and staging cannot act as an early warning.
5. Re-run the workflow (*Actions → TASO key check → Run workflow*) to confirm
   the fix, rather than waiting for tomorrow's schedule.

## Done when
- [ ] TASO API key scraped from a real browser session
- [ ] Key stored as `TASO_API_KEY` in Railway variables
- [ ] `.env` updated locally, confirmed in `.gitignore`
- [ ] A local `getGroups`/`getMatches` call against a real Veikkausliiga
      `competition_id` returns data, not a 403

## Next
→ `014-google-oauth-setup.md`
