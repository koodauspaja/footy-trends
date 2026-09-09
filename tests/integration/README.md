# Integration tests

Place tests that exercise multiple application boundaries here, such as a
route handler with a real database or cache. Keep these tests separate from
unit tests because they may require external services or setup.

Run them with:

```bash
npm run test:integration
```

## They run against their own database

Since #304, `npm run test:integration` runs against **`<your database>_test`**,
not the one `npm run dev` uses. `scripts/with-test-db.ts` creates and migrates it
first, then runs vitest with `DATABASE_URL` pointed at it.

These tests insert and delete rows — `itest-*` users among them — and used to do
that in whatever database the developer was signed into. They also read what is
there, which is how six e2e specs came to depend on data a particular machine
happened to hold (#304). A separate database removes both by construction rather
than by remembering.

Override the derivation with `TEST_DATABASE_URL` where it is wrong.
