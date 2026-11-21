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
  // "answer Sourcery's second review", "address review feedback", "respond to comments":
  // the review within three words of the verb, in the same clause.
  /\b(?:answer(?:s|ed|ing)?|address(?:es|ed|ing)?|respond(?:s|ed|ing)? to|repl(?:y|ies|ied|ying) to)\s+(?:[\w'’]+\s+){0,3}?(?:reviews?|comments?|findings?|feedback|suggestions?)\b/i,
  // "fix review findings", "fix Sourcery's findings", "fix the SonarCloud review comments"
  /\bfix(?:es|ed|ing)?\s+(?:the\s+)?(?:review|sourcery|sonar(?:cloud)?)(?:'s)?\s+(?:review\s+)?(?:findings?|comments?|issues?|feedback)\b/i,
  // "fix findings from Sourcery review"
  /\bfix(?:es|ed|ing)?\s+(?:the\s+)?(?:findings?|comments?|issues?|feedback)\s+(?:from|of)\s+(?:the\s+)?(?:(?:sourcery|sonar(?:cloud)?|code)(?:'s)?\s+)?review\b/i,
  // "apply suggestions", "applied Sourcery's review suggestions", "apply the review's suggestions"
  /\bappl(?:y|ies|ied|ying)\s+(?:the\s+)?(?:(?:review|sourcery|sonar(?:cloud)?|code review)(?:'s)?\s+)?(?:review\s+)?suggestions?\b/i,
  // "review round 2"
  /\breview\s+round\b/i,
  // "per Sourcery review", "per SonarCloud review"
  /\bper\s+(?:the\s+)?(?:(?:sourcery|sonar(?:cloud)?|code)\s+)?review\b/i,
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
