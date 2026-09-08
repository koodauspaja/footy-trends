# 025 — Choose your own profile picture

## Summary

Let a signed-in reader replace the Google profile picture with one of their
own, and take it off again. `specs/024-account-settings.md` displays the `image`
better-auth stores from Google and stops there; this is the row it deliberately
left out (#268).

## Decisions this spec commits to

These were settled with Miikka on 2026-09-08, before the spec was written,
because each one changes what gets built rather than how.

| Decision | Choice | Why |
|---|---|---|
| Where the bytes live | **Postgres, in its own `user_avatar` table** | No new vendor, no new secret, no infra step. Deletion is a foreign-key cascade, so an account cannot leave an orphaned image behind — which is what keeps 024's "irreversible and complete" promise true by construction rather than by a reconciliation job. Included in the existing backups. |
| Processing | **Server-side `sharp`, re-encoded to 256×256 WebP** | Re-encoding strips EXIF as a side effect, and phone photos carry GPS coordinates. It also means we never serve bytes a reader supplied. A client-side resize is a convenience, not a security control. |
| Moderation | **Deferred, with the trigger named** | An avatar is visible only to the reader who set it. Nothing in the app shows one reader's image to another. That stops being true at #118 or #247, and this spec says so where the next person will find it. |

## Scope

### In scope

- A `Profiilikuva` section on `/asetukset`: the current picture, an upload
  control, and a way to remove a custom one.
- Storing one custom avatar per user, re-encoded to a fixed size and format.
- Serving it back to its owner from a route handler.
- The account menu preferring a custom avatar over the Google one.
- Deleting the avatar with the account.

### Out of scope

- **Cropping, rotating or filters.** The upload is resized to a square from the
  centre. A crop tool is a feature of its own and the picture is 28px in the
  only place it is rendered.
- **Animated avatars.** GIF is not accepted, and an animated WebP is stored as
  its first frame.
- **Showing an avatar to anyone but its owner.** No surface exists that would,
  and building one is #118 / #247.
- **Moderation, reporting, or review.** See the decision above.
- **A CDN, object storage, or a Railway volume.** Revisit when the table is
  large enough to measure, not before.
- **Changing the Google picture itself,** or unlinking it. `image` stays as
  better-auth wrote it, which is what makes removal a fallback rather than a
  loss.
- **Avatars for signed-out readers.** There is no identity to attach one to.

## UX / UI (Finnish strings)

### `/asetukset`, signed in — a new section

Placed after `Oletussarjat` and before `Kirjautuneet laitteet`, so the two
preference sections stay together and the account-level controls follow.

```
Profiilikuva

[ 64×64 preview ]  Käytössä oma kuvasi.

Valitse kuva
[ file input ]
JPEG, PNG, WebP tai HEIC, enintään 8 Mt.

[ Tallenna kuva ]  [ Poista oma kuva ]
```

| Element | String |
|---|---|
| Heading | `Profiilikuva` |
| Explanation | `Kuva näkyy vain sinulle, tilivalikossa.` |
| State — custom avatar set | `Käytössä oma kuvasi.` |
| State — Google's picture | `Käytössä Google-tilisi kuva.` |
| State — neither | `Ei kuvaa käytössä. Valikossa näkyy nimesi.` |
| File input label | `Valitse kuva` |
| Hint under the input | `JPEG, PNG, WebP tai HEIC, enintään 8 Mt.` |
| Save button | `Tallenna kuva` |
| Remove button | `Poista oma kuva` |

The remove button renders only when a custom avatar exists — there is nothing
to remove otherwise, and a disabled button that is always disabled tells the
reader nothing.

### Notices

Reusing `Notice`, as every other section on the page does.

| Case | String |
|---|---|
| Saved | `Profiilikuva päivitetty.` |
| Removed | `Oma kuva poistettu.` |
| No file chosen | `Valitse ensin kuva.` |
| Over the byte cap | `Kuva on liian suuri. Enimmäiskoko on 8 Mt.` |
| Wrong type | `Tuetut kuvatyypit ovat JPEG, PNG, WebP ja HEIC.` |
| Decodes to nothing usable | `Kuvaa ei voitu lukea. Kokeile toista kuvaa.` |
| Any other save failure | `Kuvan tallentaminen epäonnistui. Yritä uudelleen.` |
| Remove failed | `Kuvan poistaminen epäonnistui. Yritä uudelleen.` |

Four distinct failure strings rather than one, because the reader's next action
differs in each: pick a file, pick a smaller one, pick a different format, try
again.

### The account menu

Unchanged in appearance. The fallback chain becomes **custom avatar → Google
`image` → name**, extending the two-step chain 024 established. The trigger's
`aria-label` and the empty `alt` stay exactly as they are: the button is already
named, and repeating the reader's name would be noise.

## API & Data

### Schema

```ts
export const userAvatar = pgTable("user_avatar", {
  // One avatar per user, so the foreign key is the primary key. An upload
  // replaces rather than accumulates, and `on delete cascade` is what makes
  // account deletion complete without a second code path.
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // Always the output of our own re-encode, never what was uploaded.
  bytes: customType<{ data: Buffer }>({ dataType: () => "bytea" })("bytes").notNull(),
  // Stored rather than assumed: the column outlives whatever `sharp` is
  // configured to emit today, and the route handler must not guess.
  contentType: text("content_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

`updatedAt` is load-bearing, not bookkeeping: its epoch-millisecond value is the
cache-busting version in the image URL.

### Serving — `GET /api/avatar/me`

| | |
|---|---|
| Auth | Session required; **no user id is accepted from the client**, matching the rule in `settings-actions.ts` |
| 200 | The stored bytes, `Content-Type` from the row |
| 401 | Signed out |
| 404 | Signed in with no custom avatar |
| Headers | `Cache-Control: private, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` |

`immutable` is safe only because the URL carries `?v=<updatedAt epoch ms>`: a new
upload produces a new URL, and the old one is never requested again. Without the
version parameter this cache policy would pin a stale picture for a year.

`private` because the response is scoped to one reader's session — a shared
cache must never hold it.

### Knowing an avatar exists

The `customSession` plugin already enriches `/api/auth/get-session` with
`defaultRegion`. It gains one more field:

```ts
avatarVersion: number | null   // updatedAt epoch ms, or null when there is none
```

The client builds `/api/avatar/me?v=${avatarVersion}` when it is non-null. This
adds no round trip — the browser already fetches the session, and the header is
client-rendered precisely so the four `STATIC_BY_DESIGN` pages stay prerendered
(#182).

**One query, not two.** `getDefaultRegionFor` is replaced by a single helper
returning both fields with a `LEFT JOIN`, so enriching the session still costs
one round trip rather than growing by one per field added.

### Writing — server actions

New `src/lib/avatar-actions.ts`, separate from `settings-actions.ts` so that
`sharp` is not pulled into the module every other settings write goes through.

**A `POST` route handler was the alternative**, and it has one genuine
advantage: the server-action body limit below does not apply to route handlers,
so the whole `bodySizeLimit` question would disappear. It is not chosen, for two
reasons. Server actions carry Next's own origin check, where a route handler
would rely entirely on the session cookie's `SameSite` for the same protection.
And every other write on this page is an action with the same
`useTransition`/`ActionResult` shape; one upload doing it differently is a
second pattern to learn for a saved config line.

`sharp` runs in the Node runtime, which is where server actions already run.
The route handler that *serves* bytes pins `export const runtime = "nodejs"`
explicitly — it touches no native module, but it reads a session and a database,
and neither belongs on an edge runtime.

| Action | Signature | Returns |
|---|---|---|
| `saveAvatar` | `(formData: FormData) => Promise<AvatarResult>` | `{ ok: true, version: number }` or `{ ok: false, reason }` |
| `removeAvatar` | `() => Promise<ActionResult>` | `{ ok: true }` or `{ ok: false }` |

`reason` is one of `"missing" | "too-large" | "unsupported" | "unreadable" |
"failed"`, mapping one-to-one onto the four notices above plus the generic one.
A discriminated reason rather than a message, because the strings are Finnish UI
copy and belong in the component, not in a server module.

### The 1 MB wall in front of all of this

Next enforces a body limit on **server actions** — `1024 * 1024` bytes, read
straight out of `action-handler.js` in the version this repo pins. Over it, the
action never runs: Next throws a 413 before any code in `avatar-actions.ts` is
reached, and the client sees a *rejected invocation* rather than a returned
`{ ok: false }`.

Left alone, that makes the byte cap a fiction. Every upload between 1 MB and the
stated cap — which is most phone photographs — would fail with the generic
"try again" notice, and the "image is too large" string would be unreachable
except for files the client already refused.

Two things follow, and both are requirements rather than notes:

1. `next.config.ts` sets `experimental.serverActions.bodySizeLimit` to **10 MB**,
   above the app's own 8 MB cap so that the app's cap is the one that speaks.
   The gap absorbs multipart framing, which is bytes on the wire that are not
   bytes of the image.
2. The **client checks `file.size` before submitting** and shows the size
   notice itself. Not as validation — the server is the truth for what gets
   stored — but so that the reader who picks a 20 MB file is told which rule
   they hit, rather than watching a slow upload end in a shrug.

### Processing pipeline, in order

1. **Byte cap first**, before anything decodes: reject over 8 MB. A cap applied
   after decoding is not a cap.
2. **Magic bytes**, not the browser's `Content-Type`: `\x89PNG`, `\xFF\xD8\xFF`,
   `RIFF….WEBP`, or an ISO-BMFF `ftyp` brand of `heic`/`heix`/`mif1`. The
   client's claim about its own file is not evidence.
3. **`sharp` with `limitInputPixels: 40_000_000`**, which bounds a decompression
   bomb — a few hundred kilobytes of PNG can declare 40000×40000. sharp's own
   default is ~268 megapixels, which decodes to roughly 800 MB of raw pixels and
   is far past what this container should attempt. 40 MP covers every phone
   camera and costs ~120 MB at peak.
4. `.rotate()` — applies the EXIF orientation, so a phone photo is not stored
   sideways. Must come before the resize.
5. `.resize(256, 256, { fit: "cover", position: "attention" })` — sharp picks
   the crop by saliency instead of taking the middle, which is the difference
   between keeping a face and keeping a chin. The cost is that the crop is
   content-dependent, so a test may assert the output's size and format but
   never an exact pixel region.
6. `.webp({ quality: 80 })`, then `.toBuffer()`.
7. Upsert on `userId`, setting `updatedAt` to now.

Anything that throws in 3–6 becomes `"unreadable"`. Nothing is written.

### Caching

No Redis. The picture is per-reader and read on a settings page and a header —
the browser cache holds it, keyed by a URL that changes when the picture does.
`revalidatePath("/settings")` after a write, as the other settings actions do.

## Edge Cases

| Case | Behaviour |
|---|---|
| No file selected, `Tallenna kuva` pressed | `Valitse ensin kuva.` Nothing is written. |
| File over 8 MB | Rejected before decoding, `Kuva on liian suuri…`. Checked client-side too, purely to fail fast — the server check is the real one. |
| A `.png` that is actually a PDF | Magic bytes reject it: `Tuetut kuvatyypit…` |
| Valid header, corrupt body | `sharp` throws, `Kuvaa ei voitu lukea…`, nothing stored |
| Enormous declared dimensions | `limitInputPixels` refuses; same notice |
| Animated WebP | First frame stored, silently. It is a 28px avatar. |
| Portrait or panoramic photo | Centre square, per `fit: "cover"` |
| Transparent PNG | Preserved — WebP carries alpha |
| A file past the *configured* body limit (over 10 MB) | The action is rejected by Next before it runs. The client's `catch` maps a rejection on this path to the size notice, because it is the only thing it can be — the client already refused anything over 8 MB. |
| Upload while the session expired | `{ ok: false, reason: "failed" }` → generic notice; the header will already have fallen back to `Kirjaudu sisään` |
| Remove when no custom avatar exists | Succeeds and changes nothing; the button is not rendered in that state anyway |
| Custom removed, Google `image` is null | Menu falls back to the name, which is 024's existing behaviour |
| Account deleted | Row goes with the user by cascade. Verified in an integration test, not assumed. |
| Two tabs, one uploads | The other keeps the old picture until its next session fetch. The URL is versioned, so it never shows a *wrong* image — only an old one. |
| `?v=` missing or wrong | The handler ignores it entirely and serves the current row; it is a cache key, not an argument. |

## Performance & Limits

| | |
|---|---|
| Upload cap | 8 MB, with Next's server-action body limit raised to 10 MB |
| Accepted in | JPEG, PNG, WebP, HEIC |
| Stored as | WebP, 256×256, quality 80 |
| Stored size, worst case | **21 kB** — measured, see below |
| Per-user rows | Exactly one, by primary key |
| Extra queries per session read | Zero; the existing preference query gains a join |

256px rather than 28: the avatar is 28px today, but a retina display asks for
twice that, and a settings preview shows it larger. Storing one size that covers
both beats storing the smallest that covers neither.

### What an avatar costs, measured

Encoded on 2026-09-08 with the `sharp` already in the tree, at 1024×1024 input:

| Input | 256px q80 | 256px q75 | 192px q80 | 128px q80 |
|---|---|---|---|---|
| Random noise | **20.6 kB** | 16.6 kB | 9.1 kB | 2.5 kB |
| Blurred noise, photograph-like | 3.3 kB | 2.2 kB | 2.1 kB | 1.0 kB |
| Gradient | 0.8 kB | 0.8 kB | 0.7 kB | 0.4 kB |
| Flat colour | 0.2 kB | 0.2 kB | 0.1 kB | 0.1 kB |

Random noise is incompressible, so **20.6 kB is a ceiling rather than an
average**: no photograph encodes worse than noise at the same dimensions. The
numbers in between are what synthetic inputs compress to, not what portraits
do — real photographs sit above the blurred-noise row and below the noise one.

### When Postgres stops being the right home

The database has an **8 GB limit**. For scale, the whole application's data
today — every match, every standings row, both providers, four seasons of TASO
— is **21 MB**, of which `taso_matches` is 6 MB.

At the 21 kB ceiling, plus row and TOAST overhead, call it 24 kB an avatar:

| Readers with a custom avatar | Table size | Share of 8 GB |
|---|---|---|
| 1 000 | ~24 MB | 0.3 % |
| 10 000 | ~240 MB | 3 % |
| 40 000 | ~960 MB | 12 % |
| 350 000 | ~8 GB | 100 % |

So the answer to "at what point do we need something else" is a real number
rather than a feeling, and it is far away — a thousand readers with avatars cost
about what the entire application costs today. The risk is not running out; it
is nobody noticing the ratio change.

**So the table watches itself.** After a successful upload — a rare write, once
per reader — `avatar.ts` reads `pg_total_relation_size('user_avatar')` and logs
at `warn` when it exceeds **800 MB, 10 % of the limit**, naming the size and the
row count. That is roughly 33 000 avatars at the ceiling and more in practice,
which leaves the whole of the remaining 90 % to react in. Axiom already carries
`warn`, so this needs no new monitoring.

The threshold is a constant with the 8 GB limit written beside it, because the
limit is a property of the plan and will change before the code does.

**And when it fires, the next step is a Railway volume** — Miikka's call, made
here so the warning arrives with an answer attached rather than an open
question. A volume keeps the bytes off the database and needs no new vendor,
account or secret, which is what ruled object storage out of this spec in the
first place; the reasons stay the same at 800 MB.

Three things would have to be true, and all three are true today — worth
writing down because the migration is what breaks if one of them quietly stops
being:

- **One replica.** A volume is attached to a single service instance. The
  moment the app scales horizontally, files on disk stop being shared and this
  answer expires.
- **A backup story of its own.** The bytes leave `pg_dump` on the day they
  leave the database. Today's backups cover avatars for free; a volume means
  arranging that separately, or accepting that a lost volume costs everyone
  their picture — recoverable, since Google's is still there, but not silent.
- **A migration that reads from both.** Rows and files coexist while the
  copy runs, so the read path has to try the file and fall back to the row.
  That is a day's work, not an afternoon's, which is the honest reason not to
  do it before the warning fires.

## Security & Secrets

- **No new environment variables and no new secrets.** Deliberate — it is half
  the reason Postgres won over object storage.
- **No user id from the client.** Both actions and the route handler resolve the
  session themselves, which removes "change or read someone else's avatar" as a
  category rather than checking for it.
- **We never serve uploaded bytes.** Everything served is `sharp`'s output.
- **EXIF, including GPS, does not survive** the re-encode.
- `X-Content-Type-Options: nosniff` and an explicit `Content-Type`, so a stored
  byte sequence cannot be interpreted as anything but an image.
- `sharp` becomes a **direct** dependency rather than a new one: `npm ls sharp`
  already reports `next@16.3.4 → sharp@0.35.4`, so its native binary is already
  built wherever Next builds, Railway included.

  Promoting it is not tidiness. In `package-lock.json` today `sharp` is
  `"optional": true` — it reaches us as an *optional* dependency of Next, so an
  install that skips optional dependencies leaves the module we import missing,
  and the failure appears at runtime on the upload path rather than at install.
  A direct entry in `dependencies` is what makes it required.

  The related trap — a lockfile generated on macOS omitting the Linux
  binary — was checked rather than assumed: this lockfile carries every
  platform variant, `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64`
  included, so a Nixpacks (Debian, glibc) build has what it needs. The build is
  still verified in CI before merge.

## Acceptance Criteria

- [ ] `npm run db:migrate` creates `user_avatar` with a primary-key foreign key
      to `user` that cascades on delete.
- [ ] Signed in at `/asetukset`, a `Profiilikuva` section shows the current
      picture and the correct one of the three state strings.
- [ ] Uploading a JPEG, a PNG and a WebP each store a 256×256 WebP, and the
      account menu shows it without a reload.
- [ ] A photo carrying EXIF orientation is stored the right way up, and the
      stored bytes contain no EXIF block.
- [ ] A 3 MB photograph — over Next's default server-action limit and under the
      app's cap — uploads successfully. Without the `bodySizeLimit` change this
      fails, which is the whole reason the setting is in this spec.
- [ ] A 9 MB image is refused with `Kuva on liian suuri. Enimmäiskoko on 8 Mt.`
      and nothing is written.
- [ ] A file that is not JPEG, PNG, WebP or HEIC — including one renamed to `.png` —
      is refused with `Tuetut kuvatyypit ovat JPEG, PNG, WebP ja HEIC.`
- [ ] `Poista oma kuva` removes the row; the menu falls back to the Google
      picture, and to the name when there is none.
- [ ] `GET /api/avatar/me` answers 401 signed out, 404 signed in with no avatar,
      and 200 with `Cache-Control: private, max-age=31536000, immutable`.
- [ ] Deleting the account deletes the avatar row.
- [ ] Storing an avatar while `user_avatar` is over the threshold logs one
      `warn` naming the table size and row count, and storing one below it logs
      nothing. Verified by lowering the threshold in a test, not by waiting for
      800 MB.
- [ ] `/`, `/kotimaa`, `/ulkomaat` and `/maajoukkueet` are still prerendered:
      `npm run build` reports them static and
      `tests/unit/app/rendering-mode.test.ts` passes unedited.
- [ ] Unit coverage 100% on all four metrics; integration and e2e pass; lint,
      typecheck and build pass, with `sharp` installed on CI's platform.

## Tests Required

### Unit — `tests/unit/`

| File | Asserts |
|---|---|
| `lib/avatar-image.test.ts` (new) | The pipeline as a pure function: byte cap before decode; magic-byte sniffing accepts the three types and rejects a renamed PDF; a real fixture is re-encoded to 256×256 WebP; an EXIF-rotated fixture comes out upright and EXIF-free; a corrupt body and an oversized declared canvas both throw the same `unreadable`. Real `sharp`, real fixtures — a mocked encoder would assert nothing about the thing being tested. |
| `lib/avatar-actions.test.ts` (new) | Signed out returns `{ ok: false }` and never touches the database; each rejection maps to its `reason`; success upserts and returns the new version; `removeAvatar` deletes only the caller's row. |
| `lib/avatar.test.ts` (new) | The size warning fires above the threshold and stays quiet below it, and a failure to read the table size never fails the upload — a diagnostic that can break the thing it watches is worse than no diagnostic. |
| `components/settings-page.test.tsx` | The three state strings; the remove button renders only with a custom avatar; each `reason` renders its own notice; the preview uses the versioned URL; a file over the cap shows the size notice **without** calling the action, and a rejected invocation on the upload path shows it too. |
| `app/api/avatar/route.test.ts` (new) | 401, 404 and 200 with the exact headers; the body is the stored bytes; `?v=` is ignored. |

### Integration — `tests/integration/avatar.test.ts` (new)

Against real Postgres: insert, replace (one row, new `updatedAt`), delete, and —
the one that matters — deleting the `user` row removes the avatar with it.

### E2E — `tests/e2e/settings.spec.ts`

Signed out: `/asetukset` shows no `Profiilikuva` section, and
`/api/avatar/me` answers 401.

**The signed-in section is not reachable end to end**, for the reason already
documented in that file: `/asetukset` reads its session on the server, so
intercepting the browser's `/api/auth/get-session` does not reach it. A test
written that way would assert against the signed-out page while claiming to test
the signed-in one. The upload path is covered by the unit and integration tests
above, and by a manual staging check listed on the issue.

## Files To Update

| File | Change |
|---|---|
| `specs/025-custom-avatar.md` | this |
| `decisions/025-custom-avatar.md` | new, written while building |
| `package.json` | promote `sharp` to a direct dependency (already present via `next`) |
| `next.config.ts` | `experimental.serverActions.bodySizeLimit: "10mb"` |
| `src/db/schema.ts` | `user_avatar` |
| `drizzle/` | generated migration |
| `src/lib/avatar-image.ts` | new — validation and re-encoding, no database |
| `src/lib/avatar-actions.ts` | new — `saveAvatar`, `removeAvatar` |
| `src/lib/avatar.ts` | new — reads and writes the row, and warns when the table grows past its share of the database |
| `src/lib/preferences.ts` | one query returning region **and** avatar version |
| `src/lib/auth.ts` | `customSession` gains `avatarVersion` |
| `src/app/api/avatar/me/route.ts` | new — serves the bytes |
| `src/components/settings-page.tsx` | the `Profiilikuva` section |
| `src/components/account-menu.tsx` | prefer the custom avatar |
| `src/components/auth-controls.tsx` | pass the versioned URL through |
| `tests/fixtures/avatar/` | new — a small JPEG, PNG, WebP, an EXIF-rotated JPEG, a renamed PDF, a corrupt file |

`.env.example` is **not** in this list, and that is the point of the storage
decision: nothing here needs configuring.

## Open Questions

1. ~~**Does `sharp` build cleanly on Railway?**~~ **Answered while writing this
   spec, by measurement rather than expectation:** `npm ls sharp` reports it
   already installed at 0.35.4 as a dependency of `next@16.3.4`. The binary
   builds wherever Next builds. This was the item that could have sent the whole
   approach back; it does not.
2. ~~**Is 2 MB the right cap?**~~ **Answered, and the original number was
   wrong.** A 12-megapixel phone photograph is 3–5 MB as JPEG, so a 2 MB cap
   would have rejected the most ordinary upload there is. The cap is **8 MB**.
   Checking it also turned up the constraint above: Next's own server-action
   limit is 1 MB, so *any* cap over that is decorative until `next.config.ts`
   says otherwise — the 2 MB version of this spec would have shipped a rule the
   framework silently enforced at half the value. And since `sharp`'s prebuilt
   binary here decodes HEIF (measured: `sharp.format.heif.input.buffer` is
   `true`, libvips 8.18.6), HEIC is accepted too, which is what an iPhone hands
   over when the file is not converted on the way.
3. ~~**When does the table stop being the right home?**~~ **Answered, after
   Miikka pointed out the 8 GB database limit:** measured the encoder's worst
   case and the current database, and wrote both the arithmetic and a
   self-watching threshold into Performance & Limits above. What is *not*
   answered in code is what we would move to, but the direction is decided: a
   **Railway volume**, per Miikka on 2026-09-08, for the same reason Postgres
   won here — no new vendor, account or secret. The three preconditions are
   listed above.

## Follow-ups this spec creates

| Follow-up | Why not now |
|---|---|
| Moderation, before any reader sees another's avatar | No such surface exists; #118 and #247 are where it starts to matter |
| Cropping | A feature of its own, for a 28px picture |
| Object storage or a CDN | Nothing measures the current approach as a problem |
