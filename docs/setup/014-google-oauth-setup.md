# 014 — Google OAuth setup

## Goal
Create a Google Cloud project, enable the OAuth API, and generate credentials
so the app can offer Google sign-in. No app code in this step — just the
infrastructure. The credentials will sit in Railway as environment variables,
ready for the NextAuth integration in the feature spec.

---

## Step 1 — Create a Google Cloud project

1. Go to https://console.cloud.google.com
2. Click the project dropdown at the top → **New project**
3. Name: `footy-trends`
4. Organisation: leave as default (or select one if you have it)
5. Click **Create**
6. Make sure the new project is selected in the dropdown before continuing

---

## Step 2 — Configure the OAuth consent screen

Before creating credentials, Google requires a consent screen — this is what
users see when they click "Sign in with Google".

1. Go to **APIs & Services** → **OAuth consent screen**
2. User type: **External** (allows any Google account to sign in)
3. Click **Create**
4. Fill in the required fields:
   - App name: `Footy Trends`
   - User support email: your email
   - Developer contact email: your email
5. Click **Save and continue**
6. On the **Scopes** screen — click **Save and continue** without adding any
   (the defaults `openid`, `email`, and `profile` are added automatically)
7. On the **Test users** screen — add your own Google account and your
   friend's account
   - While the app is in **Testing** mode only listed test users can sign in
   - This is fine for development; you can publish later if needed
8. Click **Save and continue**

---

## Step 3 — Create OAuth credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `footy-trends-web`
5. Under **Authorised redirect URIs**, add both:
   ```
   http://localhost:3000/api/auth/callback/google
   https://YOUR-RAILWAY-URL/api/auth/callback/google
   ```
   Replace `YOUR-RAILWAY-URL` with your actual Railway production URL
   (found in Railway → project → app service → **Settings** → **Domains**)
6. Click **Create**
7. A dialog shows your **Client ID** and **Client Secret** — copy both
   immediately and store in your password manager

> You can return to this screen later to retrieve the Client ID, but the
> Client Secret is only shown once at creation. If you lose it, you will
> need to create a new credential.

---

## Step 4 — Store credentials in Railway

1. Go to Railway → project → app service → **Variables** tab
2. Add the following variables:

| Name | Value |
|------|-------|
| `GOOGLE_CLIENT_ID` | your Client ID from Step 3 |
| `GOOGLE_CLIENT_SECRET` | your Client Secret from Step 3 |
| `NEXTAUTH_SECRET` | a random string (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | your Railway production URL, e.g. `https://footy-trends.up.railway.app` |

Generate the `NEXTAUTH_SECRET` locally:
```bash
openssl rand -base64 32
```

---

## Step 5 — Store credentials locally

Add to your `.env` file:

```
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
NEXTAUTH_SECRET=your_random_secret
NEXTAUTH_URL=http://localhost:3000
```

Note that `NEXTAUTH_URL` differs between local (localhost) and production
(Railway URL) — Railway overrides it automatically via the Variables tab.

---

## Step 6 — Verify the consent screen works

You can confirm the OAuth flow is configured correctly before writing any
app code by visiting the Google authorisation URL directly in your browser:

```
https://accounts.google.com/o/oauth2/v2/auth?client_id=YOUR_CLIENT_ID&redirect_uri=http://localhost:3000/api/auth/callback/google&response_type=code&scope=openid%20email%20profile
```

Replace `YOUR_CLIENT_ID` with your actual Client ID. You should see the
Google sign-in screen followed by your consent screen. It will fail after
consent (no app is listening yet) — that is expected. The goal is just to
confirm the consent screen appears and looks correct.

---

## Done when
- [ ] Google Cloud project `footy-trends` created
- [ ] OAuth consent screen configured with test users added
- [ ] OAuth client ID and secret generated
- [ ] `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`, and
      `NEXTAUTH_URL` stored in Railway variables
- [ ] Same variables added to local `.env`
- [ ] Consent screen verified in browser

## Next
→ `015-database-setup.md`