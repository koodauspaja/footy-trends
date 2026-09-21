import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { canSkip } from "../../../scripts/backfill-plan";

const RAW = readFileSync(path.join(process.cwd(), "scripts", "backfill-run.ts"), "utf8");

/**
 * Comments stripped, so the guards below match *code* rather than prose. The
 * comment explaining this fix names the expression it replaced, and a plain
 * text search cannot tell an explanation from a use — it failed on its own
 * documentation the first time it ran.
 */
const SOURCE = ts.transpileModule(RAW, {
  compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext },
}).outputText;

/**
 * #219 was not a wrong calculation — every function involved was correct. It
 * was the wrong *input*: the backfill took the current TASO season from
 * `new Date().getUTCFullYear()` while the app discovers it from the provider,
 * which spec 011 exists to require.
 *
 * No test of the pure helpers can catch that, because they are handed the
 * season and cannot know where it came from. So this reads the source, in the
 * same spirit as `tests/unit/app/rendering-mode.test.ts`: the thing worth
 * guarding is a choice made at the call site.
 */
describe("the backfill's current TASO season", () => {
  it("comes from the provider", () => {
    expect(SOURCE).toContain("getCurrentSeason");
  });

  // `resolveTasoSeasonContext` is what the app uses, and it is the wrong tool
  // here: it also computes `defaultSeason`, which syncs a season to learn
  // whether it has matches. Thirteen of those turns a discovery step into a
  // second backfill — measured, when the first attempt at this fix did not
  // finish inside ten minutes.
  it("does not reach for the app's heavier season-context helper", () => {
    expect(SOURCE).not.toContain("resolveTasoSeasonContext");
  });

  // Discovery is competition-agnostic (spec 011), so asking once and flooring
  // per competition is both correct and one request instead of thirteen.
  it("discovers once, outside the competition loop", () => {
    const occurrences = SOURCE.match(/getCurrentSeason\(\)/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  // A failed discovery must not fall back to a guess: backfilling the wrong
  // range is worse than not backfilling, and silently wrong is the failure
  // this whole issue is about.
  it("refuses to guess when discovery fails", () => {
    expect(SOURCE).toMatch(/discovered === null/);
  });

  // `getCurrentSeason` has two failure shapes: it returns null when TASO
  // publishes no seasons, and throws on a network or HTTP error. Handling only
  // the first sends an outage to the top-level handler, losing the refusal and
  // the run summary with it. The app's own `discoverCurrentSeason` wraps it for
  // the same reason.
  it("catches a thrown discovery failure, not only a null one", () => {
    expect(SOURCE).toMatch(/try\s*\{[^}]*getCurrentSeason[^}]*\}\s*catch/s);
  });

  it("is not taken from the clock", () => {
    // The exact expression #219 was filed for, and any near relative of it.
    expect(SOURCE).not.toMatch(/new Date\(\)\.getUTCFullYear\(\)/);
    expect(SOURCE).not.toMatch(/new Date\(\)\.getFullYear\(\)/);
  });

  it("is paced like every other TASO call, since discovery reaches the provider", () => {
    expect(SOURCE).toMatch(/taso\(\(\)\s*=>\s*getCurrentSeason/);
  });
});

/**
 * Why the input matters, stated as behaviour rather than left implicit in the
 * guard above. These pass before and after the fix — they are the consequence,
 * not the regression.
 */
describe("canSkip at a year boundary", () => {
  // TASO publishes 2027 in December 2026, or runs 2026 past New Year. The two
  // answers below are for the *same* stored season, and they differ.
  it("treats a stored season as finished when the clock is ahead of the provider", () => {
    expect(canSkip(380, 2026, 2027)).toBe(true);
  });

  it("keeps refreshing that same season when the provider is the source", () => {
    expect(canSkip(380, 2026, 2026)).toBe(false);
  });

  // The reverse disagreement: the clock has rolled over but TASO has not.
  it("skips a season the provider still considers current, if the clock leads", () => {
    expect(canSkip(120, 2026, 2027)).toBe(true);
    expect(canSkip(120, 2026, 2026)).toBe(false);
  });
});

/**
 * `--refetch` exists for a column added after production was filled: every
 * stored season is complete by the old definition and empty by the new one, so
 * the ordinary run skips them all and writes nothing (specs/036).
 *
 * Read from the source for the same reason as the season guard above: what
 * matters is the choice at each skip site, which no pure helper can see.
 */
describe("the backfill's refetch flag", () => {
  it("guards every skip check, so a refetch run fetches what is stored", () => {
    const guarded = SOURCE.match(/!refetch\s*&&\s*\(?await already/g) ?? [];

    // The three: football-data's matches, TASO's matches, TASO's groups.
    expect(guarded).toHaveLength(3);
  });

  it("leaves no skip check unguarded", () => {
    const all = SOURCE.match(/await already[A-Za-z]*\(/g) ?? [];
    const guarded = SOURCE.match(/!refetch\s*&&\s*\(?await already/g) ?? [];

    expect(all).toHaveLength(guarded.length);
  });

  it("reaches both halves of the run", () => {
    expect(SOURCE).toMatch(/backfillFootballData\([^)]*refetch/);
    expect(SOURCE).toMatch(/backfillTaso\([^)]*refetch/);
  });

  it("is off unless asked for, so an ordinary run keeps its skips", () => {
    expect(SOURCE).toMatch(/refetch\s*=\s*false/);
  });

  /**
   * The entry point is the other half of the same wiring: a flag parsed and
   * not passed on would leave every assertion above true and the run
   * unchanged.
   */
  it("is read from the command line and handed to the run", () => {
    const entryPoint = ts.transpileModule(
      readFileSync(path.join(process.cwd(), "scripts", "backfill.ts"), "utf8"),
      { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext } }
    ).outputText;

    expect(entryPoint).toMatch(/refetch\s*=\s*args\.includes\("--refetch"\)/);
    expect(entryPoint).toMatch(/backfill\(\{[^}]*refetch/);
  });
});
