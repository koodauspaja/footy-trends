/**
 * The rule that a commit's subject says what the commit changes, not that it
 * answers a review. Pure: `commit-subject-steps.ts` reads the message or the
 * pull request's commits.
 *
 * decisions/841-commit-subject-gate.md
 */

/**
 * Phrases that name the review process as the subject. Each needs the review
 * named in it, so a subject that only mentions Sourcery or an answer, such as
 * "check:sourcery says which kind of Sourcery review a head has", passes.
 *
 * decisions/841-commit-subject-gate.md
 */
const PROCESS_PHRASES: readonly RegExp[] = [
  // "answer Sourcery's second review", "address review feedback", "respond to comments"
  /\b(?:answer|address|respond|repl(?:y|ie))\w*\s+(?:to\s+)?(?:\S+\s+){0,3}?(?:review|comment|finding|feedback|suggestion)s?\b/i,
  // "answer Sourcery", "address Sonar", "reply to the reviewer": the reviewer named instead
  /\b(?:answer|address|respond|repl(?:y|ie))\w*\s+(?:to\s+)?(?:the\s+)?(?:sourcery|sonar\w*|reviewers?)\b/i,
  // "fix review findings", "fix Sourcery's findings", "fix the SonarCloud review comments"
  /\bfix\w*\s+(?:the\s+)?(?:review|sourcery|sonar)\S*\s+(?:review\s+)?(?:finding|comment|issue|feedback)s?\b/i,
  // "fix findings from Sourcery review"
  /\bfix\w*\s+(?:the\s+)?(?:finding|comment|issue|feedback)s?\s+(?:from|of)\s+(?:the\s+)?(?:\S+\s+)?review\b/i,
  // "apply suggestions", "applied Sourcery's review suggestions", "apply the review's suggestions"
  /\bappl(?:y|ie)\w*\s+(?:the\s+)?(?:(?:review|sourcery|sonar|code)\S*\s+){0,2}suggestions?\b/i,
  // "review round 2", but not "review round-trip parsing"
  /\breview\s+round(?![\w-])/i,
  // "per Sourcery review", "per SonarCloud review"
  /\bper\s+(?:the\s+)?(?:(?:sourcery|sonar|code)\S*\s+)?review\b/i,
];

/**
 * Where a subject's clauses meet: punctuation, or "and", "or", "but". A phrase
 * is read within one clause, so "answers come from the cache, and the comments
 * table is dropped" names no review.
 *
 * decisions/841-commit-subject-gate.md
 */
const CLAUSE_BREAK = /[,;:—]|\s(?:and|or|but)\s/i;

/**
 * The words in `subject` that name the review process, or `null` when it names
 * none.
 *
 * decisions/841-commit-subject-gate.md
 */
export function processPhrase(subject: string): string | null {
  for (const clause of subject.split(CLAUSE_BREAK)) {
    for (const pattern of PROCESS_PHRASES) {
      const match = pattern.exec(clause);
      if (match !== null) return match[0];
    }
  }
  return null;
}

/**
 * A commit message's subject: its first line that is not blank. `git commit -m`
 * keeps a first line starting with `#`, and the editor puts git's comments below.
 *
 * decisions/841-commit-subject-gate.md
 */
export function subjectOf(message: string): string {
  const line = message.split("\n").find((text) => text.trim() !== "");
  return (line ?? "").trim();
}

export type Offender = { commit: string | null; subject: string; phrase: string };

/**
 * What a refused subject is told: which words name the review, and what to
 * write instead.
 *
 * decisions/841-commit-subject-gate.md
 */
export function refusal(offenders: readonly Offender[]): string {
  const count =
    offenders.length === 1 ? "a commit subject names" : `${offenders.length} commit subjects name`;
  return [
    `Refused: ${count} the review instead of the change:`,
    ...offenders.map(offenderLine),
    "",
    "Say what the commit changes, as a reader of git log needs it:",
    "  chore: the Bash hook catches gh -R and git add * (#806)",
    "not who asked for it:",
    "  chore: answer Sourcery's second review (#806)",
  ].join("\n");
}

/**
 * One refused subject: its commit when there is one, the subject, and the
 * words that named the review.
 *
 * decisions/841-commit-subject-gate.md
 */
function offenderLine({ commit, subject, phrase }: Offender): string {
  const prefix = commit === null ? "" : `${commit.slice(0, 7)} `;
  return `  ${prefix}${subject}  ("${phrase}")`;
}
