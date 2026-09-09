# 014 — Google OAuth setup

## Goal
Create the Google Cloud projects behind Google sign-in and generate their
credentials. No app code here — just the infrastructure. The credentials sit in
Railway as environment variables, feeding the better-auth integration in
`specs/023-google-oauth-login.md`.

---

## Two projects, not one

**There are two Google Cloud projects, and that is deliberate (#264).**

| | Project | Consent screen | Who can sign in |
|---|---|---|---|
| Local + staging | `footy-trends` | **Testing** | only accounts on its test-user list |
| Production | `footy-trends-prod` | **Published** | anyone with a Google account |

The reason is that **the publishing status and the test-user list belong to a
project's consent screen, not to an OAuth client**. Two clients inside one
project share one consent screen, so publishing for production would have
un-gated development at the same moment — and keeping development gated is the
point.

So the test-user list is not leftover state to be cleaned up. It is how the
development project is meant to stay.

---

## Step 1 — Create the projects

1. Go to https://console.cloud.google.com
2. Project dropdown → **New project**
3. Create one for development (`footy-trends`) and one for production
   (`footy-trends-prod`). A display name can be changed later; the project ID
   cannot.
4. Make sure you have the right project selected before each of the steps below
   — everything after this is per project.

---

## Step 2 — Configure each consent screen

Do this **twice**, once per project.

1. **APIs & Services** → **OAuth consent screen**
2. User type: **External**
3. App name `Footy Trends`, your email as support and developer contact
4. **App information**: Google will not let an External app publish without an
   **application home page** and an **authorised domain**, and the two take
   different shapes:

   | Field | Shape | Example |
   |---|---|---|
   | Application home page | a full URL, with scheme | `https://<production host>/` |
   | Authorised domains | the bare domain, no scheme and no path | `<production host>` |

   Google also expects an authorised domain to be one you can verify in Search
   Console. A shared platform subdomain may not be, in which case a custom
   domain is the way through — worth finding out before the publish step rather
   than during it.

   The development project needs neither while it stays in Testing.
5. **Scopes**: save without adding any. The defaults `openid`, `email` and
   `profile` are added automatically. Requesting anything beyond these is what
   would trigger a full Google verification review.
6. **Test users**:
   - *Development project*: add the accounts that develop the app. This list is
     what keeps localhost and staging closed, and it stays.
   - *Production project*: no list is needed once the screen is published.

### Publishing status

- The **development** project stays in **Testing**.
- The **production** project is **published** (Testing → In production) — but
  **not yet**. Publishing requires the privacy policy and terms URLs from
  Step 5, so do that step first and come back here. Google refuses the
  transition without them.

A published app without Google verification still shows an "unverified app"
interstitial to first-time visitors. That is tolerable for non-sensitive scopes
and a small audience, and it is what the production project does today.

---

## Step 3 — Create an OAuth client in each project

**APIs & Services** → **Credentials** → **+ Create credentials** → **OAuth client
ID** → **Web application**.

Each project gets its own client, and the redirect URIs are what separate them:

| Project | Authorised redirect URIs |
|---|---|
| `footy-trends` (dev) | `http://localhost:3000/api/auth/callback/google`<br>`https://<staging host>/api/auth/callback/google` |
| `footy-trends-prod` | `https://<production host>/api/auth/callback/google` |

Find each host in Railway → project → the environment → app service →
**Settings** → **Domains**. Staging and production are different hosts.

> The **Client ID** can be read again later. The **Client secret** is shown once
> at creation — store it immediately. A lost secret means creating a new client,
> not recovering the old one.

---

## Step 4 — Store the credentials

Four variables per environment. The pair comes from **that environment's own
project**.

| Name | Local (`.env`) | Railway staging | Railway production |
|------|----------------|-----------------|--------------------|
| `GOOGLE_CLIENT_ID` | dev project | dev project | **prod project** |
| `GOOGLE_CLIENT_SECRET` | dev project | dev project | **prod project** |
| `BETTER_AUTH_SECRET` | any random string | its own | **its own** |
| `BETTER_AUTH_URL` | `http://localhost:3000` | `https://<staging host>` | `https://<production host>` |

Generate each secret with:

```bash
openssl rand -base64 32
```

**`BETTER_AUTH_SECRET` is per environment, deliberately.** Sharing one would not
grant access across environments — the databases are separate, so a cookie
signed elsewhere names a session that does not exist here — but it would mean a
leak from the looser environment is also a leak from production. Note that
changing it invalidates every session cookie, so everyone signed in is signed
out; choose it before opening sign-up rather than after.

**`BETTER_AUTH_URL` is a full origin, not a hostname** — scheme included, no
trailing slash and no path, exactly as the local value shows. **And it must be
that environment's own.** better-auth builds
the OAuth callback from it, so a staging value in production sends Google's
redirect to staging — and it fails *after* the reader has consented, which reads
as "sign-in is broken" rather than "one variable is wrong".

> **Renamed in `specs/023-google-oauth-login.md`.** This step originally named
> these `NEXTAUTH_SECRET` and `NEXTAUTH_URL`. The app uses **better-auth**, not
> NextAuth, which reads the `BETTER_AUTH_*` names. If the old pair is still set
> anywhere, copy the values across — nothing needs regenerating — and delete the
> `NEXTAUTH_*` variables once sign-in works.

---

## Step 5 — The published project also needs its documents

Google requires a privacy policy and terms of service, reachable **without
signing in**, before a consent screen can leave Testing. The app publishes both:

| | URL |
|---|---|
| Privacy policy | `https://<production host>/tietosuoja` |
| Terms of service | `https://<production host>/kayttoehdot` |

Both are static pages, and `tests/unit/app/rendering-mode.test.ts` asserts they
stay that way: it checks that neither takes request props nor opts out of
prerendering, so one cannot quietly start reading a session and become
unreachable to a signed-out visitor. Enter them on the production
project's consent screen.

---

## Step 6 — Verify

The honest check is a real sign-in, per environment:

- **Production**: an account that has never been a test user signs in and comes
  back signed in.
- **Local and staging**: an account that is *not* on the development project's
  test-user list is refused by Google, before it reaches the app. Losing that is
  the failure the two-project split exists to prevent, and it is worth checking
  rather than assuming.

A consent screen can also be confirmed without any app code by opening the
authorisation URL directly. **The client id and the redirect URI have to come
from the same project**, or Google answers `redirect_uri_mismatch` before the
screen ever appears — the production client does not carry the localhost URI.

For the **development** project:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=<dev client id>&redirect_uri=http://localhost:3000/api/auth/callback/google&response_type=code&scope=openid%20email%20profile
```

For the **production** project, use its client id and its own callback:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=<prod client id>&redirect_uri=https://<production host>/api/auth/callback/google&response_type=code&scope=openid%20email%20profile
```

Either will fail after consent when nothing is listening, which is expected. The
point is that the consent screen appears and names the right app.

## Done when
- [ ] Both Google Cloud projects exist, with their own consent screens
- [ ] The production project has an application home page and authorised domain,
      without which Google will not publish it
- [ ] The development project is in **Testing** with its test-user list; the
      production project is **published**
- [ ] Each project has an OAuth client carrying only its own redirect URIs
- [ ] All four variables are set in `.env`, Railway staging and Railway
      production, each from the right project
- [ ] The privacy policy and terms URLs are entered on the production consent
      screen
- [ ] A non-test account can sign in on production, and cannot on staging

## Next
→ `015-database-setup.md`
