# Installing Footy Trends locally

From a fresh clone to a running app:

```bash
git clone https://github.com/koodauspaja/footy-trends.git
cd footy-trends
./scripts/setup
```

The app then runs at <http://localhost:3000>.

`scripts/setup` is safe to run again: it fills in what is missing and changes
nothing that is already set.

## Prerequisites

| | |
|---|---|
| Node.js | The major version in `.nvmrc` (24). `nvm install` or `fnm install` reads it |
| npm | 12.0.2, the `packageManager` pin. `npm install -g npm@12.0.2` |
| A container runtime | Anything providing `docker compose`: Docker Desktop, OrbStack, Colima, or Podman with its docker-compatible CLI |

`scripts/setup` checks all of these and reports every one that is missing at
once. It installs none of them: Node needs a version manager the calling shell
can see — which no script can arrange for the shell that started it — and a
container runtime is a system-wide install that wants your consent.

Postgres 18 and Redis 8 come from `docker-compose.yml`, so nothing needs
installing for them. `brew install postgresql@18 redis` is an escape hatch if
containers are not an option on your machine, at the cost of the parity with
production that `postgres:18-alpine` gives.

## What `scripts/setup` does

1. Checks Node and `docker compose`.
2. `npm ci`, unless the installed tree is already newer than the lockfile.
3. Writes `.env` from `.env.example`, generating `FOOTY_POSTGRES_PASSWORD`,
   the matching `DATABASE_URL` and `BETTER_AUTH_SECRET`.
4. Asks for the two API keys below. Both are optional; press Enter to skip.
5. `npm run db:migrate`, which starts the containers first.
6. Installs the Playwright browser for the end-to-end suite.
7. Offers to start the dev server.

## The two API keys

Everything else `.env` needs is either fixed by `docker-compose.yml` or
generated. These two come from outside the repository:

| | |
|---|---|
| `FOOTBALL_DATA_API_KEY` | Free registration at [football-data.org](https://www.football-data.org/client/register) — `docs/setup/007-football-data-api.md` |
| `TASO_API_KEY` | Read from tulospalvelu.palloliitto.fi's own requests — `docs/setup/020-taso-api-key.md` |

Without them the dev server still starts, and every page that has data stored
renders. What does not work is fetching: foreign leagues (`/ulkomaat`) and the
World Cup and Euro pages without the first, Finnish competitions (`/kotimaa`)
and Finland's national teams without the second. `npm run test:e2e` refuses to
start until both are set.

Signing in additionally needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
(`docs/setup/014-google-oauth-setup.md`). Every page works signed out without
them.

**`.env.example` is the annotated list of every variable.** It is not repeated
here, because a second copy is the one that drifts — `README.md`'s had already
drifted before #400 removed it.

## By hand

The same steps without the script:

```bash
cp .env.example .env
```

Then set, in `.env`:

- `FOOTY_POSTGRES_PASSWORD` — any value
- `DATABASE_URL` — `postgresql://postgres:<that same value>@localhost:5432/footy-trends`
- `BETTER_AUTH_SECRET` — `openssl rand -base64 32`
- `BETTER_AUTH_URL` — `http://localhost:3000`
- the API keys above, if you have them

The password appears twice because the container and the application each read
one half; they must match. Then:

```bash
npm ci
npm run db:migrate   # starts the containers if they are not up
npm run dev
```

## Editor

`.vscode/extensions.json` recommends the two tools this project is checked
with: Biome (formatting and lint) and SonarLint. VS Code offers them when the
repository is opened.

`.vscode/settings.json` binds SonarLint to the SonarCloud project, so its
findings appear while the code is being written rather than in CI. It expects a
connection named `koodauspaja_footy-trends-sonar` — *SonarQube: Add SonarQube
Cloud Connection* in the command palette, organization `koodauspaja`. Without
it SonarLint still works, in unconnected mode, with fewer rules.

## Running the suites

```bash
npm run typecheck
npm run lint
npm run test:unit          # coverage, and the gaps guard
npm run test:integration   # a real Postgres, in its own database
npm run test:e2e           # Playwright, needs both API keys
npm run test:e2e:browser   # installs Chromium, once
```

The database commands and both suites start the containers themselves if they
are down. `tests/e2e/README.md` covers the end-to-end suite's own database,
port and serial execution.

## Database workflows

```bash
npm run db:generate -- --name=add_match_status_column
npm run db:migrate
```

`db:generate` **refuses to run without `--name`**, and the name must be
`<verb>_<what>` — the verb one of `add`, `create`, `alter`, `drop`, `rename` or
`backfill`. The rule is enforced rather than advised, because advice was not
enough: seven migrations reached `main` called things like
`0016_young_meteorite`, the name `drizzle-kit` invents when given none, which
says nothing to whoever reads it back during an incident.

**Never edit a migration that has already been applied anywhere.** The migrator
hashes a migration's *contents*, so changing the SQL breaks that environment's
next deploy — add a new migration instead. Renaming is safe, as long as the
`.sql` and its journal tag move together and the SQL is untouched.

`npm run db:push` syncs the schema without a migration, for local experiments
only. `npm run db:reset` drops the test database; `npm run db:reset:dev`
destroys the development one, and asks first.

## Troubleshooting

| | |
|---|---|
| `required variable FOOTY_POSTGRES_PASSWORD is missing a value` | `.env` has no password. Run `./scripts/setup` |
| Connection refused, or a password failure, on migrate | `FOOTY_POSTGRES_PASSWORD` and the password inside `DATABASE_URL` disagree. Make them match, or `npm run db:reset:dev` to recreate the database from scratch |
| `No docker command found` | No container runtime, or one installed somewhere unusual — `DOCKER_EXECUTABLE=/absolute/path` says where. It must be absolute: a relative one would put the choice back in `PATH`'s hands |
| An exported `DATABASE_URL` or `FOOTY_POSTGRES_PASSWORD` | Setup stops, because a shell export beats `.env` for everything it runs next. `unset` it, or make it match the file |
| The Docker daemon is not running | Started for you on macOS. Elsewhere, start it and re-run |
| `node: command not found` after installing nvm or fnm | Version managers are set up by your shell's startup files. Open a new terminal |
| Port 3000, 5432 or 6379 already in use | Something else is on it — often an older `docker compose` project. `docker compose ps` |

## Next

- `README.md` — what the project is, and how it is put together
- `docs/setup/README.md` — the infrastructure setup docs, in order
- `CLAUDE.md` — how work moves from a spec to a merged pull request
