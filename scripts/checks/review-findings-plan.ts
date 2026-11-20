/**
 * Sorting review findings into the classes that keep recurring, free of the
 * network so it can be unit-tested directly. A coarse indicator, not a
 * judgement: a finding is filed by the words it uses.
 *
 * decisions/290-review-finding-classes.md
 * decisions/390-review-classes-remeasured.md
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

/**
 * One pull request, as the REST API reports it.
 *
 * decisions/290-review-finding-classes.md
 */
export type ApiPull = { number: number; merged_at: string | null };

/**
 * One review comment, as the REST API reports it.
 *
 * decisions/290-review-finding-classes.md
 */
export type ApiComment = { user: { login: string } | null; path: string; body: string };

/**
 * The recurring classes, each with the label `skills/self-review.md` uses for
 * it. Every pattern is a phrase that names the defect, not a bare keyword.
 * Ordered by measured cost, largest first: a tie falls to the earlier entry.
 *
 * decisions/290-review-finding-classes.md
 * decisions/390-review-classes-remeasured.md
 */
const CLASSES = [
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
    name: "read and write without one transaction",
    label: "a read and a write that do not span one transaction",
    patterns: [
      /\btransactions?\b/i,
      /\block\b|locking/i,
      /concurrent(?:ly)?\b/i,
      /separate operations/i,
      /\brace\b|race condition/i,
      /still current|in-flight/i,
      /stale (?:response|result|preview|read|row)/i,
      /between the read and|after the .{0,30}check/i,
    ],
  },
  {
    name: "two normalisations of one value",
    label: "the same value compared under two normalisations",
    patterns: [
      /case-(?:in)?sensitiv/i,
      /lower-cases?|upper-cases?/i,
      /normalis|normaliz/i,
      /backslash|forward slash|separated paths/i,
      /as an exact (?:path|match)|exact path, but/i,
      /deduplicates|duplicate rows/i,
    ],
  },
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
      // Recent reviews say "is not caught" where older ones said "unhandled".
      /is not caught|are not caught/i,
      /no (?:Finnish )?error (?:notice|message|state)/i,
      /returned as (?:an? )?(?:empty|absent|missing)/i,
      // The label's second half, "turned into a plausible wrong value".
      /caught .{0,60}and returned as/i,
      /treats .{0,40}as success/i,
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
 * Which class a finding falls into, by how many of a class's phrases it uses,
 * not by which class is checked first. Ties fall to the earlier class.
 *
 * decisions/290-review-finding-classes.md
 */
export function classify(body: string): ClassName {
  let best: { name: ClassName; score: number } = { name: "unclassified", score: 0 };

  for (const { name, patterns } of CLASSES) {
    const score = patterns.filter((pattern) => pattern.test(body)).length;
    if (score > best.score) best = { name, score };
  }

  return best.name;
}

/**
 * The label `skills/self-review.md` uses for a class.
 *
 * decisions/290-review-finding-classes.md
 */
export function labelFor(klass: ClassName): string {
  return CLASSES.find((entry) => entry.name === klass)?.label ?? UNCLASSIFIED_LABEL;
}

/**
 * The most recently merged pull requests, newest merge first: sorted by merge
 * date, not taken in the API's order, which is by creation.
 *
 * decisions/290-review-finding-classes.md
 */
export function mergedPullNumbers(pulls: ApiPull[], count: number): number[] {
  return pulls
    .filter((pull): pull is ApiPull & { merged_at: string } => pull.merged_at !== null)
    .sort((left, right) => right.merged_at.localeCompare(left.merged_at))
    .slice(0, count)
    .map((pull) => pull.number);
}

/**
 * Sourcery is the reviewer this counts. Human review comments are excluded.
 *
 * decisions/290-review-finding-classes.md
 */
const REVIEWER = "sourcery-ai[bot]";

/**
 * One pull request's review comments, reduced to that reviewer's findings.
 *
 * decisions/290-review-finding-classes.md
 */
export function findingsFrom(pull: number, comments: ApiComment[]): Finding[] {
  return comments
    .filter((comment) => comment.user?.login === REVIEWER)
    .map((comment) => ({ pull, path: comment.path, body: comment.body }));
}

/**
 * The findings grouped by class, largest first. `unclassified` is always
 * reported last and never hidden.
 *
 * decisions/290-review-finding-classes.md
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

/**
 * The tally as a Markdown table, ready to paste into an issue.
 *
 * decisions/290-review-finding-classes.md
 */
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
