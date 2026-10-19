import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

/**
 * What the e2e suite's stand-in for TASO answers, as a pure function of the
 * request's URL. It replays recorded answers and nothing else: any other request
 * fails, as it does against the real provider when it refuses, so a page that
 * needs data the fixture lacks falls back to what is stored.
 *
 * decisions/672-e2e-without-the-provider.md
 * decisions/674-e2e-on-an-empty-database.md
 */

type ByCategory<T> = Record<string, Record<string, T>>;

type Fixture = {
  /** `getCompetitions`, when recorded: what season discovery reads. */
  competitions?: unknown[];
  categories: ByCategory<string>;
  matches: ByCategory<unknown[]>;
  /** `getCategory`'s groups, when recorded. */
  groups?: ByCategory<unknown[]>;
};

export type StubAnswer = { status: number; body: unknown };

/** What the provider's refusal looks like to the app: a failed request. */
const REFUSED: StubAnswer = { status: 503, body: { error: "not in the fixture" } };

/**
 * Every recorded answer, the two fixtures merged. The national-team one was
 * recorded from a development database and lists exactly the categories it has
 * matches for; the domestic one, written by `npm run test:e2e:record-taso`, from
 * the rows live runs stored. They never share a competition id.
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

/** Two fixtures as one, refusing a competition id both of them record. */
export function mergeFixtures(national: Fixture, domestic: Required<Fixture>): Fixture {
  const shared = Object.keys(domestic.matches).filter((id) => Object.hasOwn(national.matches, id));
  if (shared.length > 0) throw new Error(`Both fixtures record ${shared.join(", ")}`);
  return {
    competitions: domestic.competitions,
    categories: { ...national.categories, ...domestic.categories },
    matches: { ...national.matches, ...domestic.matches },
    groups: domestic.groups,
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

/**
 * A Redis of the run's own while the stand-in answers for TASO: a container that
 * Playwright starts empty on `port` and Docker removes when it stops, keeping
 * nothing on disk. The run never reads, writes or deletes anything in the Redis
 * development uses.
 *
 * decisions/674-e2e-on-an-empty-database.md
 */
export function standInRedis(port: string): { command: string; url: string } {
  return {
    command: `docker run --rm -p 127.0.0.1:${port}:6379 ${STAND_IN_REDIS_IMAGE} redis-server --save "" --appendonly no`,
    url: `redis://127.0.0.1:${port}`,
  };
}

function recorded<T>(record: ByCategory<T>, competitionId: string, categoryId: string) {
  const categories = ownEntry(record, competitionId);
  return categories === undefined ? undefined : ownEntry(categories, categoryId);
}

/** `record[key]` when the record itself has it, so `constructor` is not an id. */
function ownEntry<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
