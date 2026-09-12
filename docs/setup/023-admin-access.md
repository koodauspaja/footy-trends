# 023 — Granting admin access

## Goal

Make the first admin. Once the `/yllapito` page exists, everything after that is
done from inside the app by an admin who already exists.

Run this **once per environment**, after the migration adding the `role` column
has deployed. See `specs/028-admin-tools-and-roles.md` for what an admin can do.

> **Where this stands.** The first pull request for #119 ships the `role` column
> and `requireAdmin()`, and nothing that renders. Until the second lands, this
> document is the only way to grant or remove admin, and SQL is the only way to
> confirm it. The steps below say which parts are live today.

---

## Why this is a manual step

There is no bootstrap path in the app, deliberately.

Every automatic rule for making the first admin — "the first account to sign in
becomes one", "this address is an admin if it has no role yet", "grant it when
the table is empty" — exists forever in order to serve a single moment. Each one
is a way to grant admin by accident later: an empty table after a data incident,
a first sign-in that is not who you expected, a configuration value that gets
copied into the wrong environment.

One `UPDATE`, run once by a person, cannot misfire twice. It is the rare case
where a manual step is safer than the thing that would automate it away.

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

```sql
update "user"
   set role = 'admin', updated_at = now()
 where email = 'first.admin@example.fi';
```

Replace the address with the real one. It is not written down here, and should
not be: this is a public repository.

**Check what you changed before you commit to it.** `update … where email = …`
matches one row if the address is right and zero if it is not, and zero looks
identical to success unless you look:

```sql
select email, role from "user" where role = 'admin';
```

Expect exactly the account you intended, and no others.

---

## Step 4 — Confirm the grant

**Today, the readback in Step 3 is the confirmation.** There is nothing to click
yet: the first pull request for #119 adds the role and the check that reads it,
and no screen uses either. `requireAdmin()` exists and answers correctly; the
`/yllapito` page and the account-menu link arrive with the second.

So confirm in SQL, and expect exactly the account you intended:

```sql
select email, role from "user" where role = 'admin';
```

`requireAdmin()` reads the column on every request rather than trusting the
session, so the grant takes effect on the next request. Nobody has to sign out
and back in — and, more importantly, revoking an admin takes effect just as
quickly.

### Once the page exists

Sign in as that account. The account menu shows **Ylläpito**, and `/yllapito`
loads.

A signed-in reader gets **404** there, not 403 — the page does not announce
itself to people who may not use it. So a 404 from the account you just granted
means the grant did not work, rather than that the page is missing. That
distinction only becomes checkable when the page lands; until then a 404 there
means only that the route does not exist yet.

---

## Removing an admin

**Today, in SQL** — there is no page yet:

```sql
update "user" set role = 'user', updated_at = now()
 where email = 'former.admin@example.fi';
```

SQL has no guard against removing the last admin, so check before you run it, or
you will be back at Step 3 with nobody able to grant anything from inside the
app:

```sql
select email from "user" where role = 'admin';
```

`requireAdmin()` reads the column per request, so a revocation takes effect on
the revoked admin's next request rather than when their session expires.

**Once `/yllapito` exists**, another admin does it there, which is the point of
the column. The page refuses to remove the last admin, so it will not be
possible to lock everyone out from inside the app — the guard this SQL does not
have.

---

## Environments

Each environment has its own database and therefore its own admins. Granting in
staging grants nothing in production, and the reverse. Run this once per
environment where somebody needs the access.

---

## Done when

- [ ] `information_schema` shows `user.role` as `text`, default `'user'::text`,
      not nullable
- [ ] `select email, role from "user" where role = 'admin'` returns exactly the
      intended account, and no others
- [ ] The address used is not written into this repository — it is public
- [ ] Repeated once per environment that needs an admin; staging and production
      have separate databases and therefore separate admins

Once `/yllapito` ships:

- [ ] That account sees **Ylläpito** in the account menu and `/yllapito` loads
- [ ] A signed-in reader gets **404** at `/yllapito`, not 403

## Next
→ Nothing scheduled. This is a one-time operation per environment; after the
  first admin exists, `/yllapito` is where admins are added and removed.
