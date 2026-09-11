import { describe, expect, it } from "vitest";
import {
  INITIAL_STATUS,
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
