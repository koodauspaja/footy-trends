import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { RecordedFixture } from "../../scripts/record-taso-fixture-plan";

/**
 * What the e2e suite's stand-in for TASO answers, as a pure function of the
 * request's URL: recorded answers, and for anything else the failure the real
 * provider gives when it refuses, so a page falls back to what is stored.
 *
 * decisions/672-e2e-without-the-provider.md
 * decisions/674-e2e-on-an-empty-database.md
 */

type ByCategory<T> = Record<string, Record<string, T>>;

/** What the stand-in replays: the recorder's shape, competitions and groups optional. */
type Fixture = Pick<RecordedFixture, "categories" | "matches"> &
  Partial<Pick<RecordedFixture, "competitions" | "groups">>;

export type StubAnswer = { status: number; body: unknown };

/** What the provider's refusal looks like to the app: a failed request. */
const REFUSED: StubAnswer = { status: 503, body: { error: "not in the fixture" } };

/**
 * Every recorded answer: the national-team fixture and the domestic one that
 * `npm run test:e2e:record-taso` writes, merged.
 *
 * decisions/672-e2e-without-the-provider.md
 * decisions/674-e2e-on-an-empty-database.md
 */
export function loadFixture(root: string = process.cwd()): Fixture {
  const fixtures = join(root, "tests/e2e/fixtures");
  const national = JSON.parse(
    readFileSync(join(fixtures, "taso-national-teams.json"), "utf8")
  ) as Fixture;
  const domestic = JSON.parse(
    gunzipSync(readFileSync(join(fixtures, "taso-domestic.json.gz"))).toString("utf8")
  ) as Required<Fixture>;
  return mergeFixtures(national, domestic);
}

/** Two fixtures as one, refusing a competition id both of them record anything for. */
export function mergeFixtures(national: Fixture, domestic: Required<Fixture>): Fixture {
  const ids = (fixture: Fixture) => [
    ...Object.keys(fixture.matches),
    ...Object.keys(fixture.categories),
    ...Object.keys(fixture.groups ?? {}),
  ];
  const nationalIds = new Set(ids(national));
  const shared = [...new Set(ids(domestic))].filter((id) => nationalIds.has(id));
  if (shared.length > 0) throw new Error(`Both fixtures record ${shared.join(", ")}`);
  return {
    competitions: [...(national.competitions ?? []), ...domestic.competitions],
    categories: { ...national.categories, ...domestic.categories },
    matches: { ...national.matches, ...domestic.matches },
    groups: { ...national.groups, ...domestic.groups },
  };
}

/**
 * The answer to one request, `path` being the URL's path and query as the app
 * sends it.
 */
export function answer(fixture: Fixture, path: string): StubAnswer {
  const url = new URL(path, "http://stub.invalid");
  // What Playwright polls to learn the server is up.
  if (url.pathname === "/") return { status: 200, body: "ok" };

  const competitionId = url.searchParams.get("competition_id") ?? "";
  const categoryId = url.searchParams.get("category_id") ?? "";

  switch (url.pathname) {
    case "/getCompetitions":
      return fixture.competitions === undefined
        ? REFUSED
        : { status: 200, body: { competitions: fixture.competitions } };
    case "/getCategories": {
      const names = ownEntry(fixture.categories, competitionId);
      if (names === undefined) return REFUSED;
      return {
        status: 200,
        body: {
          categories: Object.entries(names).map(([id, name]) => ({
            category_id: id,
            category_name: name,
          })),
        },
      };
    }
    case "/getMatches": {
      // Only a recorded list is answered, an empty one included; anything else is
      // refused, so a refresh cannot replace stored rows with nothing.
      const matches = recorded(fixture.matches, competitionId, categoryId);
      return matches === undefined ? REFUSED : { status: 200, body: { matches } };
    }
    case "/getCategory": {
      const groups = recorded(fixture.groups ?? {}, competitionId, categoryId);
      return groups === undefined ? REFUSED : { status: 200, body: { category: { groups } } };
    }
    default:
      return REFUSED;
  }
}

/** The Redis image `docker-compose.yml` runs, so the run's own matches development's. */
export const STAND_IN_REDIS_IMAGE = "redis:8-alpine";

/** The start of the Docker volume names the stand-in run's Redis uses, one per port. */
export const STAND_IN_REDIS_VOLUME_PREFIX = "footy-trends-e2e-redis";

/**
 * The stand-in run's own Redis: a container on `port`, its data kept between runs
 * in that port's volume, never touching the Redis development uses.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */
export function standInRedis(port: number): { command: string; url: string } {
  return {
    // Saved every minute with a change, and on the SIGTERM that stops it.
    command: `docker run --rm -p 127.0.0.1:${port}:6379 -v ${STAND_IN_REDIS_VOLUME_PREFIX}-${port}:/data ${STAND_IN_REDIS_IMAGE} redis-server --save 60 1`,
    url: `redis://127.0.0.1:${port}`,
  };
}

/**
 * The database a stand-in run uses, one per app port: the test database's name
 * with `_stand_in_<port>` before its `_test`, so it is never the recorder's source.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */
export function standInDatabaseUrl(testUrl: string, appPort: number): string {
  const url = new URL(testUrl);
  const suffix = `_stand_in_${appPort}_test`;
  // Already derived: Playwright evaluates its configuration again in each worker.
  if (url.pathname.endsWith(suffix)) return url.toString();
  if (!url.pathname.endsWith("_test")) {
    throw new Error(`The test database name does not end in _test: ${url.host}`);
  }
  url.pathname = url.pathname.replace(/_test$/, suffix);
  return url.toString();
}

/**
 * Whether a key in the stand-in run's Redis outlives the clear before a run:
 * football-data's answers only, which cost requests on the key staging and
 * production share. Everything else is TASO's or computed from stored rows.
 */
export function keptBetweenRuns(key: string): boolean {
  return key.startsWith("football-data:");
}

function recorded<T>(record: ByCategory<T>, competitionId: string, categoryId: string) {
  const categories = ownEntry(record, competitionId);
  return categories === undefined ? undefined : ownEntry(categories, categoryId);
}

/** `record[key]` when the record itself has it, so `constructor` is not an id. */
function ownEntry<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
