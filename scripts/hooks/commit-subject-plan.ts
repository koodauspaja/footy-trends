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
  /\b(?:answer(?:s|ed|ing)?|address(?:es|ed|ing)?|respond(?:s|ed|ing)? to|repl(?:y|ies|ied|ying) to)\b.{0,40}?\b(?:reviews?|comments?|findings?|feedback|suggestions?)\b/i,
  // "fix review findings", "fix Sourcery comments"
  /\bfix(?:es|ed|ing)?\s+(?:the\s+)?(?:review|sourcery|sonar(?:cloud)?)\s+(?:findings?|comments?|issues?|feedback)\b/i,
  // "apply suggestions", "apply Sourcery's suggestions"
  /\bapply(?:ing)?\s+(?:the\s+)?(?:(?:review|sourcery(?:'s)?|code review)\s+)?suggestions?\b/i,
  // "review round 2"
  /\breview\s+round\b/i,
  // "per Sourcery review"
  /\bper\s+(?:the\s+)?(?:(?:sourcery|sonar|code)\s+)?review\b/i,
];

/**
 * The words in `subject` that name the review process, or `null` when it names
 * none.
 *
 * decisions/841-commit-subject-gate.md
 */
export function processPhrase(subject: string): string | null {
  for (const pattern of PROCESS_PHRASES) {
    const match = pattern.exec(subject);
    if (match !== null) return match[0];
  }
  return null;
}

/**
 * A commit message's subject: its first line that is not a git comment.
 *
 * decisions/841-commit-subject-gate.md
 */
export function subjectOf(message: string): string {
  const line = message.split("\n").find((text) => text.trim() !== "" && !text.startsWith("#"));
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
  return [
    `Refused: ${offenders.length === 1 ? "a commit subject names" : `${offenders.length} commit subjects name`} the review instead of the change:`,
    ...offenders.map(
      ({ commit, subject, phrase }) =>
        `  ${commit === null ? "" : `${commit.slice(0, 7)} `}${subject}  ("${phrase}")`
    ),
    "",
    "Say what the commit changes, as a reader of git log needs it:",
    "  chore: the Bash hook catches gh -R and git add * (#806)",
    "not who asked for it:",
    "  chore: answer Sourcery's second review (#806)",
  ].join("\n");
}
