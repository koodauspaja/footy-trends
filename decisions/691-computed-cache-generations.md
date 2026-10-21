# 691 — Computed forecasts keyed by their season's generation

The season forecast (decisions/061, 064) and the knockout forecast (decisions/067)
are computed from a competition-season's stored rows and cached for 15 minutes.
A forced refresh (decisions/029) cleared their keys before its refetch and again
once its write had committed. A miss that read the old rows before the commit,
and wrote after the second clear, stored the old figures for up to 15 minutes.
A clear cannot stop that, because the late write simply comes after it. The
design was agreed in chat on 2026-10-21.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| What ties an entry to its rows | A generation per competition-season, `generation:${kind}:${code}:${seasonId}`, 0 until its first forced refresh. A forecast read takes it before it reads any row, and puts it at the end of its key, `forecast:v4:taso:VL:2026:g3` | An entry computed from the old rows is then written under the old generation's key, which nothing reads again, and expires in 15 minutes |
| When the generation moves | `INCR`, once the forced refresh's write has committed, and not on a preview, a refused write or a failed one | Only a commit changes the rows the forecasts read |
| Which clears it replaces | The two clears of the forecast keys, decisions/064's at the refetch and decisions/029's after the commit, for both forecasts; this overrides decisions/064's and decisions/067's rows on the forced refresh. The answer keys' clear at the refetch stays, and so do football-data's table's two clears | The table has the same window. Agreed in chat to keep this to the two forecasts, as #691 was filed |
| A generation Redis cannot read | The forecast is computed and not stored, and the read is logged as any failed cache read is | As a degraded read is now (decisions/534): a figure stored under a guessed generation could outlive a refresh |
| A generation Redis cannot move | Logged as a failed cache write; the forecast is at most 15 minutes behind | As a failed clear was |
| Keys from before the deploy | Left to expire | Nothing reads a key without a generation once this is deployed |
| The generation's own lifetime | No expiry | One small key per competition-season ever refreshed |

## What the tests prove

- `tests/unit/lib/cache.test.ts`, against an in-memory Redis: a computed entry
  is keyed `:g0` before any refresh and `:g3` on generation 3. A miss still
  computing when the generation moves writes its old figures, and the next read
  computes afresh rather than serving them. A generation that cannot be read
  means computed and not stored; one that cannot be moved returns `false`, and
  both are logged.
- `tests/unit/lib/force-refresh.test.ts`: the preview clears the answers and
  football-data's table, and moves nothing. The apply moves the season's
  generation after its write's transaction, clears only the table, and moves
  nothing when the write is refused or fails.
- The two services' tests: each forecast is read under its own
  competition-season.
- **Mutations**, each applied alone and restored from a commit:

  | # | Mutation | Caught by |
  |---|---|---|
  | 1 | The key without its generation | `cache.test.ts`, both generation tests |
  | 2 | A generation that cannot be read stored as 0 | `cache.test.ts` |
  | 3 | The apply moving no generation | `force-refresh.test.ts` |
  | 4 | The generation moved before the write | `force-refresh.test.ts` |
  | 5 | A season forecast read under another season | `season-simulation-service.test.ts` |
