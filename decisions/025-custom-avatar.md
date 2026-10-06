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

## Moved from comments, 2026-10-06

Cut from `src/db/schema.ts` at `a86c1cb` by #531.

- **`bytea`.** A `Buffer` is what `sharp` produces and what the route handler
  hands to a `Response`.
- **`userAvatar`.** Image bytes have no business in a row read on every
  session lookup.
- **`user_avatar.version`.** `/api/avatar/me` is one URL for every reader, so
  the query parameter is the only thing separating one reader's cached image
  from another's. A millisecond timestamp collides across readers, and the
  response is cached `private, immutable` for a year, so a shared browser
  profile could serve the previous account's picture to the next one. A
  random token cannot collide, and says nothing about when.

Cut from `src/components/auth-controls.tsx` at `a86c1cb` by #531.

- **The avatar in `AuthButtons`.** It extends the fallback chain by one. The
  version rides on the session the browser already fetches, so it costs no
  extra request.

Cut from `src/components/settings-page.tsx` at `a86c1cb` by #531.

- **`pictureInUse`.** The three states are the reader's own picture, then
  Google's, then the name, so the sentence and the picture beside it cannot
  disagree.
- **`ProfilePicture`.** The stored image is served with a year-long
  `immutable` cache, which is safe only because a new upload changes the URL.
- **The chosen file.** A `<form action>` would hand the action a `FormData`
  built from the DOM: one more place for the file to be missing, and
  untestable outside a real browser.
- **The size check in the browser.** Not validation: the server is the truth
  for what gets stored. A reader who picks a 20 MB file is otherwise told
  nothing, since a rejection cannot carry a reason.
- **A rejected upload.** A dropped connection, a crashed server and Next's
  body limit all arrive the same way, and in production the message is
  redacted. A specific notice would be wrong more often than right; the size
  case is caught before anything is sent.

Cut from `src/lib/avatar.ts` at `ef7eb13` by #531.

- **`avatar.ts`.** Postgres and not object storage or a volume: no new vendor,
  no new secret, and deletion is a foreign-key cascade, so an account cannot
  leave an orphaned image behind. That keeps the account deletion's
  "irreversible and complete" promise true by construction and not by a
  reconciliation job.
- **`DATABASE_LIMIT_BYTES` and the threshold.** The arithmetic, measured while
  scoping: an avatar is at most about 21 kB, since random noise is
  incompressible and no photograph encodes worse at the same dimensions; with
  row overhead, 24 kB. So 800 MB is roughly 33 000 readers with custom
  pictures, against a whole database that was 21 MB. The threshold is there
  so that the ratio changing is noticed by somebody, with the remaining 90%
  of the limit left to react in. The next step when it fires is a Railway
  volume.
- **`warnIfTableIsGrowing`.** It runs after a successful upload, a rare write,
  so the cost is one extra query on a path nobody waits on twice. A
  diagnostic that can break the thing it watches is worse than none: the
  avatar is already stored when it runs, and losing the warning costs a log
  line where throwing would cost the reader their upload.
- **The version in `saveAvatar`.** The same reasoning as the column's: one URL
  for every reader, cached `private, immutable` for a year, so two avatars
  saved in the same millisecond would have shared a URL. Randomness removes
  the collision, and stops the URL disclosing when the picture was set.

Cut from `src/lib/avatar-image.ts` at `ef7eb13` by #531.

- **`avatar-image.ts`.** The pure half, so every rejection can be tested by
  calling a function and not by driving a page. The numbers and the rejection
  type sit in `avatar-limits.ts`; the comment there says what it cost to
  learn.
- **`MAX_INPUT_PIXELS`.** A few hundred kilobytes of PNG can declare
  40000×40000, which sharp's own default limit (about 268 megapixels) would
  attempt at roughly 800 MB of raw pixels. 40 MP covers every phone camera
  and peaks around 120 MB.
- **`isSupportedImage`.** The browser's `Content-Type` is the client's claim
  about its own file and is not evidence: a renamed PDF arrives as
  `image/png` for the asking.
- **`processAvatar`.** A cap applied after decoding is not a cap. Every
  rejection is a `reason` and not a message, because the strings are Finnish
  UI copy and belong in the component. A second cap check on the buffer would
  be a branch that cannot be taken, and an untestable branch reads as a
  guarded case and not an impossible one.

Cut from `src/lib/preferences.ts` at `ef7eb13` by #531.

- **`getSessionExtrasFor`.** Separate from `getPreferencesFor` because it
  runs inside better-auth's `customSession` on every `/api/auth/get-session`
  call: reading a few columns and swallowing failure keeps a database blip
  from turning a session lookup, and so the whole header, into an error. A
  reader who cannot be redirected sees the region picker, the app's stock
  behaviour, and one whose avatar version is missing gets the Google picture,
  the fallback that already exists. The preference row and the avatar row are
  independently optional, and joining from `user` keeps a missing preference
  row from hiding a present avatar. Adding a field must not add a round trip
  to every page load.

Cut from `src/lib/session-extras.ts` at `ef7eb13` by #531.

- **`session-extras.ts`.** better-auth's browser client is not typed for
  server-side plugins, so `defaultRegion` and `avatarVersion` arrive as
  `unknown` however the server declares them. That is worth narrowing and not
  asserting: a region retired from the app must not redirect anyone, and a
  version that is not a string or is empty must not become a URL. The cast
  had been written twice, in `site-header.tsx` and `start-redirect.tsx`, and
  the avatar added a third field-reader; three copies of a narrowing rule is
  how one of them ends up narrower than the others.
- **`unknown` parameters.** better-auth's own session type declares none of
  these fields, so a parameter typed as "an object that might have them" has
  no overlap with what callers hold and TypeScript rejects the call.
- **`avatarSourceOf`.** The image is served `private, immutable` for a year
  on a path that is the same for every reader, so the token does two jobs: a
  new upload has to be a new URL, and one reader's cached picture must never
  be reachable at another's URL. See `src/app/api/avatar/me/route.ts`.
