# 020 — TASO API key (Veikkausliiga data)

## Goal
Obtain the TASO (`spl.torneopal.net/taso/rest/`) API key used to fetch
Veikkausliiga data, and store it as a Railway environment variable. Unlike
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
not secrets — only the key itself needs an environment variable.

---

## Step 3 — Store the key in Railway

1. Go to Railway → project → app service → **Variables** tab
2. Click **+ New Variable**
3. Name: `TASO_API_KEY`
4. Value: paste the scraped key
5. Save — Railway will redeploy automatically

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
without notice — there is no alerting for this (a documented, accepted gap;
see specs/009-veikkausliiga.md's Security & Secrets section). If TASO starts
returning 403s in production logs where it previously worked, repeat Step 1
against the live site and update the Railway variable.

## Done when
- [ ] TASO API key scraped from a real browser session
- [ ] Key stored as `TASO_API_KEY` in Railway variables
- [ ] `.env` updated locally, confirmed in `.gitignore`
- [ ] A local `getGroups`/`getMatches` call against a real Veikkausliiga
      `competition_id` returns data, not a 403

## Next
→ Back to `specs/009-veikkausliiga.md` for the feature implementation.
