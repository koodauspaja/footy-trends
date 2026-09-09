/**
 * Sorting review findings into the classes that keep recurring, kept free of
 * the network so it can be unit-tested directly — the same split as
 * `backfill-plan.ts` and `e2e-freshness-plan.ts` and their entry points.
 *
 * The classes are not invented. They come from reading every Sourcery inline
 * finding on the last fourteen merged pull requests on 2026-09-08 — 48 of them
 * across nine PRs — and they are what `skills/self-review.md` is organised
 * around. Re-running the command is how that list stays honest as the codebase
 * changes.
 *
 * **This is a coarse indicator, not a judgement.** A finding is filed by the
 * words it uses, and a review often describes one defect while mentioning
 * another. The table says which class to weight while reading your own diff; it
 * does not replace reading the findings.
 */

export type Finding = {
  /** The pull request it was left on, for grouping. */
  pull: number;
  path: string;
  body: string;
};

export type Tally = {
  klass: ClassName;
  label: string;
  count: number;
  pulls: number[];
};

/** One pull request, as the REST API reports it. */
export type ApiPull = { number: number; merged_at: string | null };

/** One review comment, as the REST API reports it. */
export type ApiComment = { user: { login: string } | null; path: string; body: string };

/**
 * The recurring classes, each with the label `skills/self-review.md` uses for
 * it — the document and the command have to say the same words, or the table
 * cannot be compared with the document it points at.
 *
 * Every pattern is a phrase that names the defect rather than a bare keyword:
 * "the test", not "test". A parser finding that mentions a test in passing
 * belongs under parsing, and the scoring below is what settles that.
 */
const CLASSES = [
  {
    name: "test proves nothing",
    label: "a test that proves nothing",
    patterns: [
      /\b(?:the|these|those) (?:new )?tests?\b/i,
      /\btests? (?:therefore |then )?(?:pass|still pass|would pass)/i,
      /passes? all|passing (?:all|every)/i,
      /passes? (?:even )?(?:when|with|despite)/i,
      /\bfixture/i,
      /reinforc/i,
      /\bassert(?:s|ing|ion)?\b/i,
      /test coverage|no tests?\b|missing tests?\b/i,
      /\bmocked?\b/i,
    ],
  },
  {
    name: "failure path dropped",
    label: "a failure path dropped, or turned into a plausible wrong value",
    patterns: [
      /unhandled/i,
      /is (?:dropped|ignored|discarded|swallowed)/i,
      /caught and discarded|discarded without/i,
      /without error handling|no error handling/i,
      /escapes? (?:as|the)/i,
      /converted to an empty/i,
      /silently (?:pass|succeed|continue|fail)/i,
      /stack trace/i,
    ],
  },
  {
    name: "parser accepts too much",
    label: "a parser accepting what it should not",
    patterns: [
      /accepts? (?:non|any|invalid|malformed)/i,
      /does not (?:recognise|recognize|reject|detect)/i,
      /\bregular expression\b|\bregex\b/i,
      /Number\(|parseInt|parseFloat/i,
      /coerc/i,
      /\bpattern (?:only|therefore|requires)/i,
    ],
  },
  {
    name: "doc contradicts code",
    label: "a comment or spec contradicting the code beside it",
    patterns: [
      /\bthe comment\b|comment (?:now )?says|comments? describe/i,
      /\bthe (?:specification|spec)\b/i,
      /documentation|documented/i,
      /describes? (?:the|it|them) as/i,
      /\bcontract\b/i,
      /misstate|contradict/i,
    ],
  },
  {
    name: "guard misses the class",
    label: "a guard covering the named line instead of the class",
    patterns: [
      /only (?:suppress|guard|check|prevent)/i,
      /does not prevent/i,
      /still (?:reach|reaches|pass|passes|ship|ships)/i,
      /bypass/i,
      /walked past|walks past/i,
      /\bescape (?:the|this) (?:guard|check)/i,
    ],
  },
  {
    name: "shared key or cache",
    label: "a shared cache key that is not per-reader",
    patterns: [
      /cache key|cached (?:image|response|render)/i,
      /\bimmutable\b/i,
      /collid|collision/i,
      /same URL|shared URL/i,
      /\brevalidat/i,
    ],
  },
  {
    name: "English reaching a Finnish UI",
    label: "English reaching a Finnish UI",
    patterns: [/English (?:browser|labels?|operating)/i, /Finnish UI/i],
  },
] as const;

export type ClassName = (typeof CLASSES)[number]["name"] | "unclassified";

const UNCLASSIFIED_LABEL = "unclassified";

/**
 * Which class a finding falls into, by **how many** of a class's phrases it
 * uses rather than by which class happens to be checked first.
 *
 * First-match-wins was the earlier design and it misfiled the obvious case: a
 * parser finding saying "the test asserts an invalid id" mentions a test once
 * and parsing three times, and belongs under parsing. Ties fall to the earlier
 * class, which is why the list is ordered by how much each class has cost.
 */
export function classify(body: string): ClassName {
  let best: { name: ClassName; score: number } = { name: "unclassified", score: 0 };

  for (const { name, patterns } of CLASSES) {
    const score = patterns.filter((pattern) => pattern.test(body)).length;
    if (score > best.score) best = { name, score };
  }

  return best.name;
}

/** The label `skills/self-review.md` uses for a class. */
export function labelFor(klass: ClassName): string {
  return CLASSES.find((entry) => entry.name === klass)?.label ?? UNCLASSIFIED_LABEL;
}

/**
 * The most recently **merged** pull requests, newest merge first.
 *
 * Sorted by merge date rather than taken in the API's own order, which is by
 * creation: a long-lived branch merged this morning would otherwise be missed
 * while an older merge was counted in its place.
 */
export function mergedPullNumbers(pulls: ApiPull[], count: number): number[] {
  return pulls
    .filter((pull): pull is ApiPull & { merged_at: string } => pull.merged_at !== null)
    .sort((left, right) => right.merged_at.localeCompare(left.merged_at))
    .slice(0, count)
    .map((pull) => pull.number);
}

/**
 * Sourcery is the reviewer this counts.
 *
 * Human review comments are deliberately excluded: they arrive as conversation
 * — "why this and not that?" — and are not the same measurement.
 */
const REVIEWER = "sourcery-ai[bot]";

/** One pull request's review comments, reduced to that reviewer's findings. */
export function findingsFrom(pull: number, comments: ApiComment[]): Finding[] {
  return comments
    .filter((comment) => comment.user?.login === REVIEWER)
    .map((comment) => ({ pull, path: comment.path, body: comment.body }));
}

/**
 * The findings grouped by class, largest first.
 *
 * `unclassified` is always reported last and never hidden: a growing
 * unclassified pile is the signal that the classes themselves need revisiting,
 * and sorting it by size would bury it mid-table on the day it matters most.
 */
export function tally(findings: Finding[]): Tally[] {
  const grouped = new Map<ClassName, Finding[]>();

  for (const finding of findings) {
    const klass = classify(finding.body);
    grouped.set(klass, [...(grouped.get(klass) ?? []), finding]);
  }

  return [...grouped.entries()]
    .map(([klass, items]) => ({
      klass,
      label: klass === "unclassified" ? UNCLASSIFIED_LABEL : labelFor(klass),
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

  const pulls = new Set(rows.flatMap((row) => row.pulls));
  const lines = [
    `${total} findings across ${pulls.size} pull requests.`,
    "",
    "| Findings | Class | Pull requests |",
    "|---|---|---|",
  ];

  for (const row of rows) {
    // The pull list is built first rather than interpolated inline: a template
    // literal inside a template literal is two levels of escaping to read at
    // once, for one line of output.
    const pulls = row.pulls.map((pull) => `#${pull}`).join(" ");
    lines.push(`| ${row.count} | ${row.label} | ${pulls} |`);
  }

  lines.push("", "See skills/self-review.md for the counter to each class.");
  return lines.join("\n");
}
