import { describe, expect, it } from "vitest";
import { classify, type Finding, format, tally } from "../../../scripts/review-findings-plan";

/**
 * The classifier behind `npm run review:findings`, from #290.
 *
 * Every body below is a real Sourcery finding, shortened — the classes were
 * derived from these, so inventing new sample text would test the patterns
 * against my idea of how reviews are worded rather than how they are.
 */

const REAL: { body: string; expected: string }[] = [
  {
    body:
      "**issue (testing):** The new browser guard never opens the account menu, so a regression in " +
      "the changed menu-panel colours passes all of these tests.",
    expected: "test proves nothing",
  },
  {
    body:
      "**issue (bug_risk):** The promise returned by `signOut().then(clearError, ...)` is dropped. " +
      "If `clearError` throws, the rejection is unhandled.",
    expected: "failure path dropped",
  },
  {
    body:
      '**🚨 issue (security):** parseProviderId accepts non-decimal ID strings such as "1e2" and ' +
      '"0x10", because Number converts them to positive integers.',
    expected: "parser accepts too much",
  },
  {
    body:
      "**nitpick:** The comment now says `bg-background text-foreground`, not `bg-background`, " +
      "while the class directly below uses `bg-background`.",
    expected: "doc contradicts code",
  },
  {
    body:
      "**issue (broader_impact):** The new guard only suppresses the diagnostic; it does not " +
      "prevent the same invalid `group_id` from reaching `normalizeGroupTeams`.",
    expected: "guard misses the class",
  },
  {
    body: "**issue (review_instructions):** The device list exposes English browser labels in the Finnish UI.",
    expected: "English reaching a Finnish UI",
  },
];

describe("classify", () => {
  it.each(REAL)("files a real finding under $expected", ({ body, expected }) => {
    expect(classify(body)).toBe(expected);
  });

  it("says so rather than guessing when nothing matches", () => {
    // A growing unclassified pile is the signal that the classes need
    // revisiting, so it must not be quietly absorbed by the nearest one.
    expect(classify("**issue:** The header row does not wrap on a narrow viewport.")).toBe(
      "unclassified"
    );
  });

  it("prefers the earlier class when a finding could be two", () => {
    // A test asserting a wrong cache key is a test problem, not a cache
    // problem: the order of the class list is what decides, and this pins it.
    expect(classify("**issue:** The test asserts the immutable cache key is a timestamp.")).toBe(
      "test proves nothing"
    );
  });
});

describe("tally", () => {
  const findings: Finding[] = [
    {
      pull: 283,
      path: "tests/e2e/dark-mode.spec.ts",
      body: "the test passes even with it removed",
    },
    { pull: 285, path: "src/lib/taso.ts", body: "the regex accepts invalid ids" },
    { pull: 270, path: "src/app/page.tsx", body: "the rejection is unhandled" },
    { pull: 283, path: "src/lib/x.ts", body: "the fixture proves nothing" },
    { pull: 265, path: "src/components/site-header.tsx", body: "the row does not wrap" },
  ];

  it("counts by class, largest first, with the pull requests that carried it", () => {
    const rows = tally(findings);

    expect(rows[0]).toMatchObject({
      klass: "test proves nothing",
      count: 2,
      pulls: [283],
    });
    expect(rows.map((row) => row.klass)).toContain("parser accepts too much");
  });

  it("puts unclassified last however large it grows", () => {
    // Sorting it by size would hide it in the middle of the table on the day it
    // matters most.
    const many = Array.from({ length: 9 }, (_, index) => ({
      pull: 265,
      path: "src/a.ts",
      body: `the row does not wrap ${index}`,
    }));

    const rows = tally([...many, ...findings]);

    expect(rows.at(-1)?.klass).toBe("unclassified");
    expect(rows.at(-1)?.count).toBeGreaterThan(rows[0]?.count ?? 0);
  });

  it("lists each pull request once, in order", () => {
    const rows = tally([
      { pull: 285, path: "a.ts", body: "the test proves nothing" },
      { pull: 265, path: "b.ts", body: "the test proves nothing" },
      { pull: 285, path: "c.ts", body: "the test proves nothing" },
    ]);

    expect(rows[0]?.pulls).toEqual([265, 285]);
  });
});

describe("format", () => {
  it("renders a table that can be pasted into an issue", () => {
    const output = format(tally([{ pull: 283, path: "a.ts", body: "the test proves nothing" }]), 1);

    expect(output).toContain("1 findings across 1 pull requests.");
    expect(output).toContain("| 1 | test proves nothing | #283 |");
    expect(output).toContain("skills/self-review.md");
  });

  it("says nothing was found rather than printing an empty table", () => {
    expect(format([], 0)).toBe("No review findings found.");
  });
});
