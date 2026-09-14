# 023 — Granting admin access

## Goal

Make the first admin. Everything after that is done from inside the app at
`/yllapito`, by an admin who already exists.

Run this **once per environment**, after the migration adding the `role` column
has deployed. See `specs/028-admin-tools-and-roles.md` for what an admin can do.

---

## Why this is a manual step

There is no bootstrap path in the app, deliberately.

Every automatic rule for making the first admin — "the first account to sign in
becomes one", "this address is an admin if it has no role yet", "grant it when
the table is empty" — exists forever in order to serve a single moment. Each one
is a way to grant admin by accident later: an empty table after a data incident,
a first sign-in that is not who you expected, a configuration value that gets
copied into the wrong environment.

One command, run once by a person, cannot misfire twice. It is the rare case
where a manual step is safer than the thing that would automate it away — but
manual does not have to mean hand-written SQL, which is why #371 replaced the
`UPDATE` this document used to carry. The script still has to be run
deliberately, by someone holding the production connection string; what it
removes is the class of mistake where a mistyped address changes nothing and
says nothing.

This is also why the role is **not** an environment variable. `AUTH_ALLOWED_EMAILS`
decides who may sign in to staging, which is a fact about an environment.
Who is an admin is a fact about a person, it changes without a deploy, and an
admin has to be able to change it from inside the app — so it lives in a column.

---

## Step 1 — Confirm the column exists

The migration is `drizzle/migrations/0015_thin_sentry.sql`, applied by the
deploy's `preDeployCommand`. Check it landed before looking for a row to update:

```sql
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_name = 'user' and column_name = 'role';
```

Expect one row: `role`, `text`, default `'user'::text`, not nullable. Every
account that already existed became a reader when the migration ran; nothing was
backfilled and nothing had to be.

---

## Step 2 — Find the account

The person must have **signed in at least once** — the row is created by
sign-in, not by this document.

```sql
select id, email, name, role, created_at
  from "user"
 order by created_at desc;
```

---

## Step 3 — Grant it

```bash
DATABASE_URL=<the production connection string> \
  npm run admin:role -- --email=first.admin@example.fi
```

Replace the address with the real one. It is not written down here, and should
not be: this is a public repository.

It prints what changed, read back from the database after the write:

```
first.admin@example.fi: user → admin
```

**It cannot silently do nothing.** An address no account holds fails and exits
non-zero, rather than reporting success:

```
No account with the address typo@example.fi. They must sign in once before a
role can be set.
```

An account that is already an admin says so and changes nothing, which is a
different message from a grant:

```
first.admin@example.fi was already admin — nothing changed.
```

**`DATABASE_URL` must be on the command.** The value in `.env` is deliberately
ignored, so a forgotten variable cannot quietly grant admin on your laptop while
you believe it happened in production — the same guard `npm run backfill` has.

---

## Step 4 — Confirm the grant

**Step 3 already confirmed it.** The script reads the role back after writing
and prints both values, so there is no separate check to remember and no way to
mistake "matched nothing" for success.

`requireAdmin()` reads the column on every request rather than trusting the
session, so the grant takes effect on the next request. Nobody has to sign out
and back in — and, more importantly, revoking an admin takes effect just as
quickly.

### And in the app

Sign in as that account. The account menu shows **Ylläpito**, and `/yllapito`
loads.

A signed-in reader gets the **not-found page** there rather than a 403 — the
page does not announce itself to people who may not use it. So seeing it from
the account you just granted means the grant did not work, rather than that the
page is missing.

(Everyone refused gets that same page, with a 200 status rather than a 404 —
Next cannot change a status once the response has begun streaming, so
`/yllapito` is identifiable as a real route by status alone. The body gives
nothing away, and `requireAdmin()` is what actually refuses. See
`specs/028-admin-tools-and-roles.md`.)

---

## Removing an admin

**From `/yllapito`**, by another admin — the page refuses to remove the last
one, so it is not possible to lock everyone out from inside the app.

The script does the same job when there is no admin left to do it there:

```bash
DATABASE_URL=<the production connection string> \
  npm run admin:role -- --email=former.admin@example.fi --role=user
```

**The script has no last-admin guard**, unlike the page. It is the recovery
path, so refusing to leave you with no admins would make it useless in the one
situation it exists for. Check first if that matters:

```sql
select email from "user" where role = 'admin';
```

`requireAdmin()` reads the column per request, so a revocation takes effect on
the revoked admin's next request rather than when their session expires.

---

## What an admin can do

Two things, both under `/yllapito`.

**Manage users** — the list on `/yllapito` itself: promote, demote, delete. The
page refuses to remove the last admin.

**Force a season to be refetched** — `/yllapito/data`, from
`specs/029-forced-season-refresh.md`. This is the escape hatch for data that
turned out to be wrong after we stored it, most often a points deduction TASO
applied to a season we had already synced and therefore never refetch.

It is a tool for abnormal situations. Expect to reach for it a handful of times
a year, if that.

### It asks before it writes

Choosing a competition and a season and pressing **Hae muutokset** fetches from
the provider and shows what *would* change — new, changed and removed rows for
each table, every team whose points deduction would move, and the matches that
would be removed **listed by name**. Nothing has been written at that point.

Read the removals before pressing **Päivitä**. That is the whole reason the step
exists: a truncated provider response looks exactly like a season that genuinely
lost fixtures, and no code can tell them apart. A person seeing
`Poistuvia otteluita: 180` can.

### What it will refuse

- **A provider that answers with nothing** for a season we hold rows for.
  Nothing is written and nothing is deleted — a provider going silent must never
  cost us data.
- **A season the app holds no rows for.** New seasons arrive through the
  ordinary sync; this tool corrects what is already there, so a competition with
  nothing stored offers an empty season list.
- **A diff that moved** between the preview and your confirmation. You are shown
  the fresh one and decide again.

### Afterwards

Every run that reached the provider is listed under **Aiemmat päivitykset**,
newest first, with what it wrote and who ran it. A run outlives the account that
made it: once that admin is deleted the row stays and the operator column reads
`Poistettu käyttäjä`.

---

## Environments

Each environment has its own database and therefore its own admins. Granting in
staging grants nothing in production, and the reverse. Run this once per
environment where somebody needs the access.

---

## Done when

- [ ] `information_schema` shows `user.role` as `text`, default `'user'::text`,
      not nullable
- [ ] `npm run admin:role` printed the change it made — `… : user → admin` —
      rather than exiting quietly
- [ ] The address used is not written into this repository — it is public
- [ ] Repeated once per environment that needs an admin; staging and production
      have separate databases and therefore separate admins

And in the app:

- [ ] That account sees **Ylläpito** in the account menu and `/yllapito` loads
- [ ] A signed-in reader gets the **not-found page** at `/yllapito`, not the admin page and not a 403
- [ ] `/yllapito/data` loads for that account, and gives everyone else the same
      not-found page

## Next
→ Nothing scheduled. This is a one-time operation per environment; after the
  first admin exists, `/yllapito` is where admins are added and removed, and
  `/yllapito/data` is where a stored season is corrected.
