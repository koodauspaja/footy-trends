import { describe, expect, it } from "vitest";
import {
  authoriseReset,
  canSkip,
  databaseNameFrom,
  delayBefore,
  describeError,
  describeTarget,
  intervalForRatePerMinute,
  tasoSeasonsFor,
} from "../../../scripts/backfill-plan";

describe("tasoSeasonsFor", () => {
  it("lists every season from the competition's own floor, newest first", () => {
    expect(tasoSeasonsFor(2024, 2026)).toEqual([2026, 2025, 2024]);
  });

  it("returns a single season when the floor is the current season", () => {
    expect(tasoSeasonsFor(2026, 2026)).toEqual([2026]);
  });

  it("returns nothing for a competition that has not started yet", () => {
    // Ykkösliiga did not exist before 2024; asking for seasons before a
    // competition's floor spends requests on seasons that never happened.
    expect(tasoSeasonsFor(2027, 2026)).toEqual([]);
  });
});

describe("intervalForRatePerMinute", () => {
  it("converts a rate into the gap between requests", () => {
    expect(intervalForRatePerMinute(60)).toBe(1000);
    expect(intervalForRatePerMinute(9)).toBe(6667);
  });

  it("rejects a rate that would divide by zero or run backwards", () => {
    expect(() => intervalForRatePerMinute(0)).toThrow(/must be positive/);
    expect(() => intervalForRatePerMinute(-1)).toThrow(/must be positive/);
  });
});

describe("delayBefore", () => {
  it("does not wait before the first request", () => {
    expect(delayBefore(null, 1_000, 6667)).toBe(0);
  });

  it("waits only for the remainder of the interval", () => {
    // Database writes happen between requests; charging for time already spent
    // would make a 344-request run considerably longer than it needs to be.
    expect(delayBefore(1_000, 3_000, 6667)).toBe(4667);
  });

  it("does not wait at all once the interval has already passed", () => {
    expect(delayBefore(1_000, 9_000, 6667)).toBe(0);
  });
});

describe("databaseNameFrom", () => {
  it("reads the database name out of a connection string", () => {
    expect(databaseNameFrom("postgresql://user:pw@host:5432/railway")).toBe("railway");
  });

  it("decodes the name, because the operator types the real one", () => {
    // The pathname is percent-encoded. Without decoding, a database called
    // `footy trends` displays as `footy%20trends` and refuses the --reset
    // confirmation that was actually correct.
    expect(databaseNameFrom("postgresql://u:pw@host:5432/footy%20trends")).toBe("footy trends");
    expect(databaseNameFrom("postgresql://u:pw@host:5432/my%2Ddb")).toBe("my-db");
  });

  it("falls back to the raw name rather than throwing on a bad escape", () => {
    expect(databaseNameFrom("postgresql://u:pw@host:5432/bad%zz")).toBe("bad%zz");
  });

  it("returns null when there is no database or the string is not a URL", () => {
    expect(databaseNameFrom("postgresql://user:pw@host:5432/")).toBeNull();
    expect(databaseNameFrom("not a url")).toBeNull();
  });
});

describe("describeTarget", () => {
  it("shows host and database", () => {
    expect(describeTarget("postgresql://user:pw@db.example.com:5432/railway")).toBe(
      "db.example.com:5432/railway"
    );
  });

  it("never leaks the credentials", () => {
    const described = describeTarget("postgresql://someuser:hunter2@host:5432/railway");
    expect(described).not.toContain("hunter2");
    expect(described).not.toContain("someuser");
  });

  it("says so when the string parses but names no database", () => {
    expect(describeTarget("postgresql://user:pw@host:5432/")).toBe("host:5432/(no database)");
  });

  it("says so rather than throwing on an unparseable value", () => {
    expect(describeTarget("nonsense")).toBe("(unparseable DATABASE_URL)");
  });
});

describe("authoriseReset", () => {
  const production = "postgresql://user:pw@host:5432/railway";

  it("allows a reset when the named database matches the target", () => {
    expect(authoriseReset(production, "railway")).toEqual({ allowed: true });
  });

  it("refuses a bare --reset, and says what to type", () => {
    const verdict = authoriseReset(production, null);
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toContain("--reset=railway");
  });

  it("refuses when the name does not match the target", () => {
    // The mistake this exists to catch: a --reset run on a shell that still has
    // a different DATABASE_URL exported.
    const verdict = authoriseReset(production, "footy-trends");
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toContain("does not match");
  });

  it("accepts a decoded name for an encoded connection string", () => {
    expect(authoriseReset("postgresql://u:pw@host:5432/footy%20trends", "footy trends")).toEqual({
      allowed: true,
    });
  });

  it("refuses an empty name rather than treating it as a match", () => {
    expect(authoriseReset(production, "").allowed).toBe(false);
  });

  it("refuses when the connection string names no database at all", () => {
    const verdict = authoriseReset("postgresql://user:pw@host:5432/", "railway");
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed === false && verdict.reason).toContain("names no database");
  });
});

describe("describeError", () => {
  it("prefers the cause, which is where the real reason lives", () => {
    // postgres-js puts the whole failed statement in `message` and the actual
    // reason in `cause`. A season-sized insert makes `message` 20KB of
    // "$3791, $3792, ..." with the one useful line buried in it.
    const error = new Error("Failed query: insert into ... $1, $2, $3");
    (error as Error & { cause?: unknown }).cause = new Error(
      'password authentication failed for user "metukka"'
    );
    expect(describeError(error)).toBe('password authentication failed for user "metukka"');
  });

  it("truncates a long message when there is no cause", () => {
    const described = describeError(new Error("x".repeat(500)), 50);
    expect(described).toHaveLength(51);
    expect(described.endsWith("…")).toBe(true);
  });

  it("leaves a short message alone", () => {
    expect(describeError(new Error("connect ECONNREFUSED"))).toBe("connect ECONNREFUSED");
  });

  it("handles something thrown that is not an Error", () => {
    expect(describeError("just a string")).toBe("just a string");
  });

  it("ignores a cause that carries no message", () => {
    const error = new Error("the outer message");
    (error as Error & { cause?: unknown }).cause = new Error("");
    expect(describeError(error)).toBe("the outer message");
  });
});

describe("canSkip", () => {
  it("skips a finished season that already holds rows", () => {
    expect(canSkip(380, 2024, 2026)).toBe(true);
  });

  it("never skips the season being played, however much is stored", () => {
    // A finished season's results do not change; the current one does.
    expect(canSkip(380, 2026, 2026)).toBe(false);
  });

  it("does not skip a season with no rows, even a finished one", () => {
    // "We tried and there was nothing" and "we never got there" look identical
    // from the outside. Re-asking about a genuinely empty season costs one
    // request; skipping one that merely failed leaves a hole nothing fills.
    expect(canSkip(0, 2018, 2026)).toBe(false);
  });

  it("does not skip a future season", () => {
    expect(canSkip(10, 2027, 2026)).toBe(false);
  });
});
