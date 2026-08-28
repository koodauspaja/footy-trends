/**
 * Turning a commit range into release notes people can read.
 *
 * A commit subject is a poor changelog line: it describes the change to the
 * code, not the thing that shipped. The issues it references do describe that,
 * and they already carry the kind — `enhancement`, `chore`, `bug` — so the
 * grouping comes from the tracker rather than from a guess at the prefix.
 *
 * Pure: resolving issues and reading specs happens in `release-version.ts`.
 */

export type IssueKind = "feature" | "chore" | "bug";

export type ResolvedIssue = {
  number: number;
  title: string;
  kind: IssueKind;
  /** One line, for features; the spec's goal. */
  description?: string | undefined;
};

/** Every `#123` in a commit subject, in order, without duplicates. */
export function issueRefsIn(subject: string): number[] {
  const seen = new Set<number>();
  for (const match of subject.matchAll(/#(\d+)/g)) {
    const n = Number(match[1]);
    if (Number.isSafeInteger(n) && n > 0) seen.add(n);
  }
  return [...seen];
}

/**
 * The kind comes from the label, because the issue templates set it and the
 * repository requires it. An issue with none of the three is left out rather
 * than guessed at — a wrong heading is worse than an absent line.
 */
export function classifyIssue(labels: string[]): IssueKind | null {
  if (labels.includes("enhancement")) return "feature";
  if (labels.includes("bug")) return "bug";
  if (labels.includes("chore")) return "chore";
  return null;
}

/** `[FEATURE] 018 — Helmarit` -> `018 — Helmarit`. */
export function stripIssuePrefix(title: string): string {
  return title.replace(/^\[(FEATURE|CHORE|BUG)\]\s*/i, "").trim();
}

/**
 * The spec number a feature issue names, so its goal can be read for the
 * description. Titles are `[FEATURE] NNN — Name` by repository convention.
 */
export function specNumberFrom(title: string): string | null {
  return /^(\d{3})\s*—/.exec(stripIssuePrefix(title))?.[1] ?? null;
}

/** First sentence of a spec's Goal section, collapsed to one line. */
export function goalSentenceOf(specBody: string): string | null {
  const goal = /^##\s+Goal\s*$([\s\S]*?)(?=^##\s|Z)/m.exec(specBody)?.[1];
  if (goal === undefined) return null;
  const text = goal.replace(/\s+/g, " ").trim();
  if (text === "") return null;
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text;
  return sentence.length > 200 ? `${sentence.slice(0, 197)}…` : sentence;
}

const HEADINGS: Record<IssueKind, string> = {
  feature: "Features",
  chore: "Chores",
  bug: "Bugs",
};

/**
 * Grouped by kind, each line naming the issue rather than the commit.
 *
 * `leftovers` are commit subjects whose issues could not be resolved — no
 * reference, an unlabelled issue, or the lookup failing. They are listed rather
 * than dropped: a release note that silently omits a change is worse than one
 * with an untidy line in it.
 */
export function formatEntries(
  issues: ResolvedIssue[],
  leftovers: string[],
  preamble: string
): string {
  const section = (kind: IssueKind): string => {
    const rows = issues.filter((i) => i.kind === kind);
    if (rows.length === 0) return "";
    const lines = rows.map((i) => {
      const name = stripIssuePrefix(i.title);
      return i.description ? `- **${name}** — ${i.description}` : `- ${name}`;
    });
    return `## ${HEADINGS[kind]}\n\n${lines.join("\n")}\n\n`;
  };

  const other =
    leftovers.length === 0 ? "" : `## Other\n\n${leftovers.map((s) => `- ${s}`).join("\n")}\n\n`;

  const body = section("feature") + section("chore") + section("bug") + other;
  return `${preamble}${body || "No changes to list.\n"}`.trimEnd();
}
