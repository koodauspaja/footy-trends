import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { canSkip } from "../../../scripts/backfill-plan";

/**
 * The backfill's two choices that no pure helper can see, read from its source:
 * where the current TASO season comes from, and what `--refetch` stops it
 * skipping.
 *
 * decisions/219-backfill-season-from-the-provider.md
 * decisions/011-current-season-discovery.md
 * decisions/036-halftime-comebacks.md
 */

const RAW = readFileSync(path.join(process.cwd(), "scripts", "backfill-run.ts"), "utf8");

// Comments stripped, so the guards below match code and not prose: the script's
// own comment names the expression these forbid, and a plain text search cannot
// tell an explanation from a use.
const SOURCE = ts.transpileModule(RAW, {
  compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext },
}).outputText;

// The backfill must take the current TASO season from the provider, as the app does,
// and not from the clock. No test of the pure helpers can see that, because they are
// handed the season: the choice is made at the call site, so this reads the source.
describe("the backfill's current TASO season", () => {
  it("comes from the provider", () => {
    expect(SOURCE).toContain("getCurrentSeason");
  });

  // `resolveTasoSeasonContext` is what the app uses, and the wrong tool here: it
  // also computes `defaultSeason`, which syncs a season to learn whether it has
  // matches. Thirteen of those turn a discovery step into a second backfill.
  it("does not reach for the app's heavier season-context helper", () => {
    expect(SOURCE).not.toContain("resolveTasoSeasonContext");
  });

  // Discovery is competition-agnostic, so asking once and flooring per
  // competition is both correct and one request, not thirteen.
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

  // `getCurrentSeason` has two failure shapes: null when TASO publishes no seasons,
  // and a throw on a network or HTTP error. Handling only the first sends an outage
  // to the top-level handler, losing the refusal and the run summary with it.
  it("catches a thrown discovery failure, not only a null one", () => {
    expect(SOURCE).toMatch(/try\s*\{[^}]*getCurrentSeason[^}]*\}\s*catch/s);
  });

  it("is not taken from the clock", () => {
    // The clock expression itself, and any near relative of it.
    expect(SOURCE).not.toMatch(/new Date\(\)\.getUTCFullYear\(\)/);
    expect(SOURCE).not.toMatch(/new Date\(\)\.getFullYear\(\)/);
  });

  it("is paced like every other TASO call, since discovery reaches the provider", () => {
    expect(SOURCE).toMatch(/taso\(\(\)\s*=>\s*getCurrentSeason/);
  });
});

// Why the input matters, stated as behaviour: the consequence of the guard
// above, and true whichever season source is used.
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

// `--refetch` is for a column added after production was filled: every stored season is
// complete by the old definition and empty by the new, so the ordinary run skips them
// all. Read from the source, because the choice is made at each skip site.
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

  // The entry point is the other half of the same wiring: a flag parsed and not
  // passed on would leave every assertion above true and the run unchanged.
  it("is read from the command line and handed to the run", () => {
    const entryPoint = ts.transpileModule(
      readFileSync(path.join(process.cwd(), "scripts", "backfill.ts"), "utf8"),
      { compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext } }
    ).outputText;

    expect(entryPoint).toMatch(/refetch\s*=\s*args\.includes\("--refetch"\)/);
    expect(entryPoint).toMatch(/backfill\(\{[^}]*refetch/);
  });
});
