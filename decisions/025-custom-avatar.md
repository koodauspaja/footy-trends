# 025 — Choose your own profile picture: decisions

Implementation notes for `specs/025-custom-avatar.md` (#268). What changed while
building, and why — the spec's own decisions are recorded there and not repeated
here.

## What the spec got wrong, found while building

### `sharp` in the browser bundle

`settings-page.tsx` is a `"use client"` module and needs `MAX_UPLOAD_BYTES` for
its size check. Importing it from `avatar-image.ts` — which imports `sharp` —
put the encoder in the client bundle, and the build failed on `fs` and
`child_process`. Not subtly: **every page on the site returned 500.**

The unit tests could not see it. They run in jsdom against modules imported
directly, where bundling never happens; all 1700 passed against an application
that could not serve its front page. The e2e suite caught it on the first run.

The fix is the same shape as the one at the top of `regions.ts`, which documents
the identical trap for `@/db` and the competition registry: the numbers and the
rejection type moved to `avatar-limits.ts`, which imports nothing.
`avatar-image.ts` now says so at the top, so the next person meets the rule
before the failure.

**The pattern worth keeping:** a client component importing *anything* from a
module that reaches Node built-ins takes the whole module with it. Three
separate specs have now hit this.

### The byte cap was a fiction

Next enforces a 1 MB body limit on server actions. Over it, the action never
runs — a 413 before any of our code — so the reader would have got the generic
"try again" notice and never the size one. `next.config.ts` now sets
`bodySizeLimit: "10mb"` against the app's 8 MB cap. Found by reading
`action-handler.js` in the pinned version rather than by hitting it.

## Decisions taken while building

| Decision | Choice | Why |
|---|---|---|
| Where the chosen file lives before upload | React state, not the DOM form | The size check needs the file before anything is sent. A `<form action>` hands the action a `FormData` built from the DOM, which jsdom does not populate from a file input — untestable outside a real browser, for no gain. |
| The second byte-cap check | Deleted | It re-checked `byteLength` after reading the buffer. `File.size` is derived from the bytes by the runtime that parsed the body, so the branch cannot be taken — and an untestable branch reads as a guarded case rather than an impossible one. |
| Reading `customSession` fields | One shared reader, `session-extras.ts` | The cast was already written twice, in `site-header.tsx` and `start-redirect.tsx`, and this feature needed a third. Three copies of a narrowing rule is how one ends up narrower than the others. |
| `getDefaultRegionFor` | Replaced by `getSessionExtrasFor` | The session payload needed a second field. Two functions would have meant two queries on every `/api/auth/get-session`; one `LEFT JOIN` from `user` keeps it at one, and joining from `user` rather than `user_preferences` is what stops a missing preferences row hiding a present avatar. |

## Measurements

Numbers in the spec that were measured rather than estimated, recorded here so
the next person can re-run them rather than trust them.

| Claim | How it was measured | Result |
|---|---|---|
| An avatar costs at most ~21 kB | Encoded random noise, blurred noise, a gradient and flat colour at 256px/q80 | 20.6 kB for noise, which is incompressible and therefore a ceiling; a photograph cannot do worse |
| The database has room | `pg_database_size` on the local database, which holds the full backfill | 21 MB total, `taso_matches` 6 MB — so 1 000 avatars ≈ the whole application today |
| `sharp` is already installed | `npm ls sharp` | 0.35.4, via `next@16.3.4` — but as an **optional** dependency, which is why it is now declared directly |
| The Linux binary is in the lockfile | Read `package-lock.json` for `@img/sharp-*` | Every platform present, `linux-x64` included; the macOS-lockfile trap does not apply here |
| HEIC can be decoded | `sharp.format.heif.input.buffer` | `true`, libvips 8.18.6 — so an iPhone's own format is accepted |
| A fragment-assembled class emits no CSS | Built the app with `{"text-" + "fuchsia-600"}` in a page | No rule emitted (this one is from #269, re-confirmed here while checking the bundle) |

## Tests worth explaining

**The orientation test was rewritten after it proved nothing.** The first
version used a solid-colour fixture and asserted the output's dimensions and
the absence of EXIF — and passed with `.rotate()` deleted, because a solid
square looks identical rotated, and sharp drops metadata either way. The fixture
is now a gradient along the long axis, and the assertion is the gradient's
*direction* in the output: vertical delta 107 with the rotation, 1 without.
Direction rather than a pixel colour, because `position: "attention"` chooses
the crop by saliency and where the square lands is not fixed.

**`sharp` is not mocked anywhere in `avatar-image.test.ts`.** Every claim the
module makes is a claim about what the encoder does; a mock would assert only
that the code calls the functions the code calls. The "corrupt body" fixture was
checked against the encoder first — it throws `vipspng: libpng read error`,
which is what separates `unreadable` from `unsupported`.

**The cascade is tested against a real database.** It is the whole reason the
bytes live in Postgres, and a mocked query builder cannot prove a foreign key.

## The cache key changed twice, under review

The version in `/api/avatar/me?v=…` started as `updatedAt` in epoch
milliseconds. Review found two faults in that, in order:

1. **Two writes in one millisecond share a URL.** Fixed first with
   `greatest(now(), updated_at + interval '1 millisecond')` in the upsert, so
   Postgres guaranteed a strictly increasing value even for concurrent writes.
2. **Two *readers* can share a URL.** The path is the same for everybody, so a
   per-user timestamp is not a per-user key: two accounts whose avatars were
   saved in the same millisecond hold identical URLs, and a `private,
   immutable` response cached in a shared browser profile would serve the first
   account's picture to the second.

The second finding subsumes the first. A random token per write — `randomUUID()`
— cannot collide within a reader or across readers, so the monotonic SQL went
away with it, and the code is simpler than before either fix. It also stops the
URL disclosing when a picture was set.

**The migration was regenerated rather than amended by a second one.** The table
is new in this PR and exists in no deployed environment, so a fresh `0012` that
creates it with the column beats shipping an `ALTER TABLE` for a table nobody
has.

## Known limit

The signed-in body of `/asetukset` is still not reachable end to end: it reads
its session on the server, so the browser-side interception the e2e suite uses
does not touch it — the boundary `tests/e2e/settings.spec.ts` documents for
specs/024. What e2e does cover is the signed-out page and the route handler's
401. Uploading a real photograph from a real phone is a manual staging check,
listed on #268.
