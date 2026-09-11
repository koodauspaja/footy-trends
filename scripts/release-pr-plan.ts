/**
 * The decisions behind opening the release pull request, kept free of `gh` and
 * the network so they can be unit-tested directly — the same split as
 * `e2e-freshness-plan.ts` and its entry point.
 */

/** The board column a release pull request starts in. */
export const INITIAL_STATUS = "In Review";

/** One `gh project field-list` field, as far as this needs to know it. */
export type ProjectField = {
  id?: unknown;
  name?: unknown;
  options?: { id?: unknown; name?: unknown }[];
};

export type StatusSelection = { fieldId: string; optionId: string };

/**
 * The Status field and the option to start in, from what `gh` answered.
 *
 * **Read, never remembered.** A hard-coded option id fails with "does not
 * belong to the field", and a command whose stderr is hidden then leaves the
 * card where it was while appearing to have worked — which is exactly what
 * happened to several cards while this feature was being built, because the id
 * in my notes was not the id on the board.
 *
 * The payload is parsed JSON from a subprocess, so nothing about its shape is
 * assumed: a missing field, a missing option, or a name that is not a string
 * all answer `null` rather than throwing somewhere less obvious.
 */
export function selectStatusOption(
  fields: unknown,
  optionName: string = INITIAL_STATUS
): StatusSelection | null {
  if (typeof fields !== "object" || fields === null) return null;
  const list = (fields as { fields?: unknown }).fields;
  if (!Array.isArray(list)) return null;

  // No `typeof name === "string"` beside this: comparing to `"Status"` already
  // says it, and the extra half is a branch no input can take.
  const status = list.find((field) => (field as ProjectField).name === "Status") as
    | ProjectField
    | undefined;
  if (status === undefined || typeof status.id !== "string") return null;

  const options = Array.isArray(status.options) ? status.options : [];
  const option = options.find((candidate) => candidate?.name === optionName);
  if (option === undefined || typeof option.id !== "string") return null;

  return { fieldId: status.id, optionId: option.id };
}

/**
 * The issue number at the end of a pull request URL, or null when the URL does
 * not end in one.
 *
 * `gh pr create` prints the URL and nothing else, so this is how the number is
 * recovered for the labels call.
 */
export function pullNumberFrom(url: string): string | null {
  // One pattern rather than splitting and testing: `split` always returns at
  // least one element, so the fallback that shape needs is a branch no input
  // can take.
  return /\/(\d+)$/.exec(url.trim())?.[1] ?? null;
}
