/**
 * Sorting review findings into the classes that keep recurring, kept free of
 * the network and the `gh` CLI so it can be unit-tested directly — the same
 * split as `backfill-plan.ts` and `e2e-freshness-plan.ts` and their entry
 * points.
 *
 * The classes are not invented. They come from reading all 53 Sourcery inline
 * findings on #265, #267, #270, #274, #279, #282, #283, #285 and #289 on
 * 2026-09-08, and they are what `skills/self-review.md` is organised around.
 * Re-running this is how that list stays honest as the codebase changes.
 */

export type Finding = {
  /** The pull request it was left on, for grouping. */
  pull: number;
  path: string;
  body: string;
};

export type Classified = Finding & { klass: ClassName };

export type Tally = {
  klass: ClassName;
  count: number;
  pulls: number[];
};

/**
 * The recurring classes, most consequential first.
 *
 * Order matters: a finding is filed under the **first** class that matches, so
 * the more specific patterns come before the more general. A comment about a
 * test that asserts the wrong cache key belongs under tests, not caching.
 */
const CLASSES = [
  {
    name: "test proves nothing",
    /**
     * The largest class by a distance, and the one that recurs across the most
     * pull requests. What it looks like: a test that passes with the behaviour
     * it names deleted.
     */
    pattern:
      /\btests?\b|\bfixture|\bassert|reinforc|coverage|\bmock(?:ed|s|ing)?\b|passes? (?:even )?(?:when|with)/i,
  },
  {
    name: "failure path dropped",
    pattern:
      /unhandled|ignored|is dropped|swallow|without error handling|caught and discarded|discarded without|rejects? (?:the|`)|converted to an empty|silently (?:pass|succeed|continue)/i,
  },
  {
    /**
     * CLAUDE.md makes this a hard rule — every user-facing string is Finnish —
     * and review has still had to say it. A rule that is only written down is
     * not a check.
     */
    name: "English reaching a Finnish UI",
    pattern: /English|Finnish UI|in Finnish/i,
  },
  {
    name: "parser accepts too much",
    pattern:
      /\bparse|\bregex|\bpattern\b|accepts? (?:non|any|invalid)|does not recognise|does not recognize|Number\(|coerc/i,
  },
  {
    name: "doc contradicts code",
    pattern:
      /\bcomment\b|\bdocument|specification|\bspec\b|describes? (?:the|it) as|contract|misstate/i,
  },
  {
    name: "guard misses the class",
    pattern:
      /only (?:suppress|guard|check)|does not prevent|still (?:reach|pass|ship)|bypass|walked past|escape/i,
  },
  {
    name: "shared key or cache",
    pattern: /\bcache|immutable|collide|collision|same URL|cache key/i,
  },
] as const;

export type ClassName = (typeof CLASSES)[number]["name"] | "unclassified";

/** Which class a finding falls into, or `unclassified` when none matches. */
export function classify(body: string): ClassName {
  for (const { name, pattern } of CLASSES) {
    if (pattern.test(body)) return name;
  }
  return "unclassified";
}

/**
 * The findings grouped by class, largest first.
 *
 * `unclassified` is always reported last and never hidden: a growing
 * unclassified pile is the signal that the classes themselves need revisiting,
 * which is the whole reason this is a script rather than a paragraph in a
 * document.
 */
export function tally(findings: Finding[]): Tally[] {
  const grouped = new Map<ClassName, Classified[]>();

  for (const finding of findings) {
    const klass = classify(finding.body);
    const existing = grouped.get(klass) ?? [];
    existing.push({ ...finding, klass });
    grouped.set(klass, existing);
  }

  return [...grouped.entries()]
    .map(([klass, items]) => ({
      klass,
      count: items.length,
      pulls: [...new Set(items.map((item) => item.pull))].sort((a, b) => a - b),
    }))
    .sort((a, b) => {
      if (a.klass === "unclassified") return 1;
      if (b.klass === "unclassified") return -1;
      return b.count - a.count;
    });
}

/** The tally as a Markdown table, ready to paste into an issue. */
export function format(rows: Tally[], total: number): string {
  if (total === 0) return "No review findings found.";

  const lines = [
    `${total} findings across ${new Set(rows.flatMap((row) => row.pulls)).size} pull requests.`,
    "",
    "| Findings | Class | Pull requests |",
    "|---|---|---|",
  ];

  for (const row of rows) {
    const pulls = row.pulls.map((pull) => `#${pull}`).join(" ");
    lines.push(`| ${row.count} | ${row.klass} | ${pulls} |`);
  }

  lines.push("", "See skills/self-review.md for the counter to each class.");
  return lines.join("\n");
}
