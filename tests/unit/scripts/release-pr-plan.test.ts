import { describe, expect, it } from "vitest";
import {
  gh,
  INITIAL_STATUS,
  PROJECT_NUMBER,
  PROJECT_OWNER,
  parseReleasePlan,
  pullNumberFrom,
  selectStatusOption,
} from "../../../scripts/release-pr-plan";

/**
 * The decisions behind opening the release pull request, from #361.
 *
 * `selectStatusOption` earns its tests: a remembered status option id is what
 * silently failed to move several cards while this feature was being built,
 * with the command's stderr hidden. Reading the ids removes that, and these
 * assert that reading them survives a payload shaped unlike the happy one.
 */
const board = (options: { id?: unknown; name?: unknown }[]) => ({
  fields: [
    { id: "PVTF_title", name: "Title" },
    { id: "PVTSSF_status", name: "Status", options },
  ],
});

describe("selectStatusOption", () => {
  it("finds the Status field and the starting option", () => {
    const chosen = selectStatusOption(
      board([
        { id: "opt-backlog", name: "Backlog" },
        { id: "opt-review", name: INITIAL_STATUS },
      ])
    );

    expect(chosen).toEqual({ fieldId: "PVTSSF_status", optionId: "opt-review" });
  });

  it("picks the option by name, not by position", () => {
    // The board's column order is not ours, and reading the wrong index is the
    // same failure as remembering the wrong id.
    const chosen = selectStatusOption(
      board([
        { id: "opt-review", name: INITIAL_STATUS },
        { id: "opt-done", name: "Done" },
      ])
    );

    expect(chosen?.optionId).toBe("opt-review");
  });

  it("answers null when the board has no such option", () => {
    // A renamed column has to fail loudly rather than move the card somewhere
    // arbitrary.
    expect(selectStatusOption(board([{ id: "opt-done", name: "Done" }]))).toBeNull();
  });

  it("answers null when there is no Status field", () => {
    expect(selectStatusOption({ fields: [{ id: "PVTF_title", name: "Title" }] })).toBeNull();
  });

  it.each([
    ["not an object", "Status"],
    ["null", null],
    ["no fields key", {}],
    ["fields that are not an array", { fields: "Status" }],
  ])("answers null for a payload that is %s", (_case, payload) => {
    // Parsed JSON from a subprocess: its shape is not ours to assume.
    expect(selectStatusOption(payload)).toBeNull();
  });

  it.each([
    [
      "a field id that is not a string",
      // The option is present and valid, so only the field-id guard can reject
      // this — an empty option list would have made the test pass for the
      // wrong reason.
      { id: 7, name: "Status", options: [{ id: "opt-review", name: INITIAL_STATUS }] },
    ],
    [
      "an option id that is not a string",
      { id: "f", name: "Status", options: [{ id: 7, name: INITIAL_STATUS }] },
    ],
    ["options that are not an array", { id: "f", name: "Status", options: "nope" }],
  ])("answers null for %s", (_case, field) => {
    expect(selectStatusOption({ fields: [field] })).toBeNull();
  });

  it("can be asked for a column other than the default", () => {
    const chosen = selectStatusOption(board([{ id: "opt-done", name: "Done" }]), "Done");

    expect(chosen?.optionId).toBe("opt-done");
  });
});

describe("pullNumberFrom", () => {
  it("takes the number off the end of a pull request URL", () => {
    expect(pullNumberFrom("https://github.com/koodauspaja/footy-trends/pull/362")).toBe("362");
  });

  it("tolerates the trailing newline gh prints", () => {
    expect(pullNumberFrom("https://github.com/koodauspaja/footy-trends/pull/362\n")).toBe("362");
  });

  it.each([
    ["an error message rather than a URL", "could not create pull request"],
    ["an empty string", ""],
    ["a URL ending in something that is not a number", "https://github.com/o/r/pull/abc"],
    ["a trailing slash", "https://github.com/o/r/pull/362/"],
  ])("answers null for %s", (_case, value) => {
    // The labels call builds a URL from this. A wrong number would label some
    // other issue, which is worse than stopping.
    expect(pullNumberFrom(value)).toBeNull();
  });
});

/**
 * The `gh` argument lists.
 *
 * These are asserted rather than excluded because each one has a way of being
 * wrong that is silent in production: a `pr create` missing `--base` opens
 * against the default branch, a label sent as one comma-joined value makes
 * GitHub create a single label named after all of them rather than refusing,
 * and a `project` call without `--format json` answers text that `JSON.parse`
 * then rejects a line later.
 *
 * Each test names the flag it protects, so a mutation to that flag fails a
 * test that says why — the counter to the "proves nothing" class in
 * skills/self-review.md.
 */
describe("the gh argument lists", () => {
  it("opens the release against release from main, with the notes on stdin", () => {
    const args = gh.createPullRequest("v1.4.0");

    expect(args.slice(0, 2)).toEqual(["pr", "create"]);
    expect(args[args.indexOf("--base") + 1]).toBe("release");
    expect(args[args.indexOf("--head") + 1]).toBe("main");
    expect(args[args.indexOf("--title") + 1]).toBe("release: v1.4.0");
    // `-` is the notes arriving on stdin rather than through a shell argument,
    // where a backtick in a release note would be a command substitution.
    expect(args[args.indexOf("--body-file") + 1]).toBe("-");
  });

  it("sends one label per request, as an array field", () => {
    const args = gh.addLabel("362", "taso");

    expect(args[1]).toBe("repos/:owner/:repo/issues/362/labels");
    expect(args[args.indexOf("-X") + 1]).toBe("POST");
    expect(args.at(-1)).toBe("labels[]=taso");
  });

  it("does not join labels into one field", () => {
    // The mutation this guards: `labels[]=${domains.join(",")}`, which GitHub
    // accepts and turns into a label literally named "taso,teams,ci".
    expect(gh.addLabel("362", "taso").at(-1)).not.toContain(",");
  });

  it("adds the pull request to this repository's board and asks for the item id", () => {
    const args = gh.addToProject("https://github.com/koodauspaja/footy-trends/pull/362");

    expect(args.slice(0, 3)).toEqual(["project", "item-add", PROJECT_NUMBER]);
    expect(args[args.indexOf("--owner") + 1]).toBe(PROJECT_OWNER);
    expect(args[args.indexOf("--url") + 1]).toBe(
      "https://github.com/koodauspaja/footy-trends/pull/362"
    );
    expect(args.at(-1)).toBe(".id");
  });

  it("asks for JSON everywhere the runner parses the answer", () => {
    // `listFields` is fed straight to `JSON.parse`, and `addToProject` and
    // `projectId` use `-q`, which gh only applies to JSON output.
    for (const args of [gh.listFields(), gh.projectId(), gh.addToProject("u")]) {
      expect(args[args.indexOf("--format") + 1]).toBe("json");
    }
  });

  it("moves the card by the ids it was given, not by remembered ones", () => {
    const args = gh.setStatus("item-1", "project-1", {
      fieldId: "field-1",
      optionId: "option-1",
    });

    expect(args.slice(0, 2)).toEqual(["project", "item-edit"]);
    expect(args[args.indexOf("--id") + 1]).toBe("item-1");
    expect(args[args.indexOf("--project-id") + 1]).toBe("project-1");
    expect(args[args.indexOf("--field-id") + 1]).toBe("field-1");
    expect(args[args.indexOf("--single-select-option-id") + 1]).toBe("option-1");
  });

  it("starts the card In Progress", () => {
    // The board's own `Pull request merged` workflow takes it to Done; the
    // review column is a human step, so this is the only status the script sets.
    expect(INITIAL_STATUS).toBe("In Progress");
  });
});

/**
 * `parseReleasePlan`.
 *
 * This is JSON out of a subprocess, so every case here is a shape the runner
 * could actually be handed. The one that matters most is a missing `version`:
 * cast rather than checked, it becomes `gh pr create --title "release:
 * undefined"`, which GitHub accepts.
 */
describe("parseReleasePlan", () => {
  const valid = JSON.stringify({
    version: "v1.4.0",
    notes: "# release: v1.4.0",
    domains: ["taso", "teams"],
  });

  it("reads back what release-version.ts prints", () => {
    expect(parseReleasePlan(valid)).toEqual({
      version: "v1.4.0",
      notes: "# release: v1.4.0",
      domains: ["taso", "teams"],
    });
  });

  it("accepts a release that touches nothing resolvable", () => {
    // No labels is a real outcome, not a failure: #357 asked for it explicitly.
    const plan = parseReleasePlan(
      JSON.stringify({ version: "v1.4.0", notes: "notes", domains: [] })
    );

    expect(plan?.domains).toEqual([]);
  });

  it.each([
    ["not JSON at all", "not json"],
    ["a bare string", '"v1.4.0"'],
    ["null", "null"],
    ["an array", "[]"],
    ["no version", JSON.stringify({ notes: "n", domains: [] })],
    ["an empty version", JSON.stringify({ version: "", notes: "n", domains: [] })],
    ["a version that is not a string", JSON.stringify({ version: 14, notes: "n", domains: [] })],
    ["no notes", JSON.stringify({ version: "v1.4.0", domains: [] })],
    ["empty notes", JSON.stringify({ version: "v1.4.0", notes: "", domains: [] })],
    ["no domains", JSON.stringify({ version: "v1.4.0", notes: "n" })],
    [
      "domains that are not an array",
      JSON.stringify({ version: "v1.4.0", notes: "n", domains: 1 }),
    ],
    [
      "a domain that is not a string",
      JSON.stringify({ version: "v1.4.0", notes: "n", domains: ["taso", 7] }),
    ],
  ])("refuses %s", (_case, payload) => {
    expect(parseReleasePlan(payload)).toBeNull();
  });
});
