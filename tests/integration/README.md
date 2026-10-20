# Integration tests

Place tests that exercise multiple application boundaries here, such as a
route handler with a real database or cache. Keep these tests separate from
unit tests because they may require external services or setup.

Run them with:

```bash
npm run test:integration
```

## They run against their own database

`npm run test:integration` runs against **`<your database>_integration_test`**,
neither the one `npm run dev` uses nor the e2e suite's `<your database>_test`.
`scripts/with-test-db.ts` creates and migrates it first, then runs vitest with
`DATABASE_URL` pointed at it.

These tests insert and delete rows — `itest-*` users among them — and used to do
that in whatever database the developer was signed into. They also read what is
there, which is how six e2e specs came to depend on data a particular machine
happened to hold (#304). A separate database removes both by construction rather
than by remembering. Separate from the e2e suite's too (#674): the TASO recorder
reads that one, and a test interrupted before its cleanup must not leave rows
there to be recorded as TASO's.

`TEST_DATABASE_URL` overrides the e2e suite's database, and this one is derived
from it, with `_integration` before its `_test`.

**Running Vitest on this directory directly is refused** (#479): it would read
`.env`'s development `DATABASE_URL`. The suite's `globalSetup` stops the run
unless `DATABASE_URL` is exactly the database derived for it, which only the
wrapper arranges; a database merely named `…_integration_test` is refused.
