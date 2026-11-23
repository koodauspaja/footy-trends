# 816 — Domain folders in `src/lib`: decisions

Chore #816. `src/lib` was one flat folder of 136 files, grouped only by name
prefix. It now has a folder per domain, and `tests/unit/lib` mirrors it. This
pull request moves files and rewrites the paths that name them, nothing else;
the split of `taso-standings-service.ts` and `guessing-game-store.ts` is a
separate pull request.

| Folder | What it holds |
|---|---|
| `admin/` | Who administers, and the admin pages' reads and writes |
| `auth/` | better-auth, the session and who may sign in, including the analytics sign-in gate and its e2e override |
| `account/` | A reader's own account: avatar, nickname, the settings page's actions and its device list |
| `preferences/` | Stored choices: preferred competitions, favourites, section folds, regions |
| `providers/` | What both providers share: the request retry, id bounds, the pacer, the fallback cache |
| `taso/` | TASO's API, its sync and reads, the domestic registry and the zone levels it publishes |
| `football-data/` | football-data.org's API, its sync and reads, its English country names and the hand-kept zone registry |
| `competitions/` | A competition's shape, cup rounds and brackets, seasons, rounds, the shared standings rules, and the page context a competition route resolves |
| `matches/` | Stored matches across both providers: the match page, head-to-head, ordering, labels |
| `teams/` | A team page's context, search, and the series and records its panels show |
| `national-team/` | The two national-team pages' rules and reads |
| `analytics/` | Competition-wide figures: goals per game, outcome shares, table volatility, and the period axis |
| `predictions/` | Elo, Poisson, the home baseline, the log, its quality, surprises and both simulations |
| `guessing-game/` | Arvauspeli |
| `refresh/` | The forced refresh |
| `platform/` | Logging, Redis, Sentry, security headers, the health endpoint's forwarding headers and token, the test-database name check |

| Decision | Why |
|---|---|
| A file that belongs to one provider goes in that provider's folder, even when another folder's topic fits too | `standings-service.ts` is football-data's sync and reads beside `taso-standings-service.ts`'s, and `domestic-competitions.ts` is TASO's category ids. The provider is what decides which code a change to its API touches |
| File names keep their prefixes: `guessing-game/guessing-game-store.ts`, not `guessing-game/store.ts` | Comments name files by their base name, in backticks; keeping it keeps every such comment true, and a moved comment is not rewritten (CLAUDE.md). It also keeps one name per file across search results and stack traces |
| No `index.ts` in a folder, and no re-exports from the old paths | One import path to each name, the same reason as decisions/811-no-import-cycles.md |
| Each import keeps its form: an `@/lib/...` alias stays an alias, a relative one is recomputed | The diff stays import lines whose only change is the path, which is what the issue's acceptance criterion compares |
| `tests/unit/lib` mirrors the folders, and the three tests named after no single file go with their subject | `taso-carry-over` to `taso/`, `guessing-game-leaderboard` to `guessing-game/`, `staging-sleep-settings` to `platform/`. `tests/integration` is named by feature, not by file, and stays flat |
| Paths in `decisions/` and `specs/` are not rewritten | A record is added, not edited (CLAUDE.md), and both describe a past change; `git log --follow` finds a file from its old path. Everything that describes the system now (`docs/`, `skills/`, configuration, comments) names the new paths |
| `scripts/` is not reorganised here | Its files are named in `package.json`, the hooks, the workflows and most skills; a separate pull request keeps each reviewable |

Verified: `npm run typecheck`, `npm run lint` and `npm run test:unit` pass,
with the same 301 test files and 6,852 tests as before the move, and 100 % on
all four coverage metrics. No path outside `decisions/` and `specs/` names a
file at its old flat location, except the example paths in the scripts' own
tests, where any path would do.
