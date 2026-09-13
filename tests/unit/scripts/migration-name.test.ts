import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  MIGRATION_TAG,
  MIGRATION_VERBS,
  planMigrationGeneration,
} from "../../../scripts/migration-name";

/**
 * What `npm run db:generate` will and will not do, from the chore that renamed
 * seven whimsically named migrations.
 *
 * The rules are tested here rather than by running the generator: the script
 * itself only spawns `drizzle-kit` with what this decides.
 */

describe("planMigrationGeneration", () => {
  it("refuses when no name is given", () => {
    const plan = planMigrationGeneration([]);

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.message).toContain("Missing --name");
    // The refusal quotes the rule, so nobody has to go and find it.
    expect(plan.message).toContain("add_refresh_runs");
  });

  it("refuses the shape drizzle-kit invents on its own", () => {
    // The case this whole guard exists for.
    for (const invented of ["young_meteorite", "fair_captain_stacy", "thin_sentry"]) {
      const plan = planMigrationGeneration([`--name=${invented}`]);

      expect(plan.ok).toBe(false);
      if (plan.ok) continue;
      expect(plan.message).toContain(`"${invented}" is not a usable migration name`);
    }
  });

  it.each(MIGRATION_VERBS)("accepts a name beginning with %s", (verb) => {
    expect(planMigrationGeneration([`--name=${verb}_something_useful`]).ok).toBe(true);
  });

  it.each([
    ["a capital letter", "Add_thing"],
    ["a hyphen", "add-thing"],
    ["a verb we do not use", "tweak_thing"],
    ["a verb with nothing after it", "add"],
    ["an empty name", ""],
  ])("refuses %s", (_case, name) => {
    expect(planMigrationGeneration([`--name=${name}`]).ok).toBe(false);
  });

  it("accepts the space-separated form the CLI also takes", () => {
    // Refusing this with "Missing --name" would be a confusing thing to tell
    // someone who plainly gave one.
    expect(planMigrationGeneration(["--name", "add_thing"])).toEqual({
      ok: true,
      forwarded: ["--name", "add_thing"],
    });
  });

  /**
   * Every way of giving `--name` that cannot be acted on.
   *
   * A following argument that is itself a flag is not a value —
   * `--name --config=x` would otherwise generate a migration called
   * `--config=x`, which is worse than refusing. And two names would mean
   * validating one while generating the other, since a filter takes the first
   * and a command-line parser generally takes the last; they are counted across
   * both forms, because mixing them is the easiest way to do it by accident.
   */
  it.each([
    ["--name followed by a flag", ["--name", "--config=other.ts"], "--name was given no value"],
    ["--name with nothing after it", ["--config=other.ts", "--name"], "--name was given no value"],
    ["two names in mixed forms", ["--name", "add_one", "--name=add_two"], "--name given 2 times"],
    ["two names in the same form", ["--name=add_one", "--name=add_two"], "--name given 2 times"],
  ])("refuses %s", (_case, argv, message) => {
    const plan = planMigrationGeneration(argv);

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.message).toContain(message);
  });

  it("validates the space-separated form like any other", () => {
    expect(planMigrationGeneration(["--name", "young_meteorite"]).ok).toBe(false);
  });

  it("forwards every other argument untouched", () => {
    // Forwarding only the name would silently drop `--config` or `--out`, so a
    // caller who asked for one configuration would quietly get the default.
    const argv = ["--config=other.config.ts", "--name=add_thing", "--out=elsewhere"];
    const plan = planMigrationGeneration(argv);

    expect(plan).toEqual({ ok: true, forwarded: argv });
  });

  it("does not hand back the caller's own array to mutate", () => {
    const argv = ["--name=add_thing"];
    const plan = planMigrationGeneration(argv);

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.forwarded).not.toBe(argv);
  });
});

describe("MIGRATION_TAG", () => {
  it("accepts a numbered, descriptive tag", () => {
    expect("0016_add_refresh_runs").toMatch(MIGRATION_TAG);
  });

  it("rejects a tag with no number, and one with no verb", () => {
    expect("add_refresh_runs").not.toMatch(MIGRATION_TAG);
    expect("0016_young_meteorite").not.toMatch(MIGRATION_TAG);
  });
});

/**
 * The documentation and the rule have now drifted apart twice in one change:
 * `docs/setup/015-database-setup.md` told a reader to wire up the unguarded
 * command, and `README.md` gave an example name the guard rejects. Both were
 * found in review rather than by running anything.
 *
 * So the examples are executable now. Every `--name` a document offers is fed
 * through the same planner the script uses, and a document that teaches a
 * command which would be refused fails here.
 */
describe("the documented examples", () => {
  const DOCUMENTS = ["README.md", "docs/setup/015-database-setup.md", "CLAUDE.md"];

  /** `<verb>_<what>` and friends describe the rule; they are not examples of it. */
  const isPlaceholder = (name: string) => name.includes("<") || name.includes(">");

  function examplesIn(file: string): string[] {
    const text = readFileSync(path.join(process.cwd(), file), "utf8");
    return [...text.matchAll(/--name[= ]([^\s`"']+)/g)]
      .map((match) => match[1] ?? "")
      .filter((name) => name !== "" && !isPlaceholder(name));
  }

  it("offers at least one real example, so this test cannot pass vacuously", () => {
    expect(DOCUMENTS.flatMap(examplesIn).length).toBeGreaterThan(0);
  });

  it.each(DOCUMENTS.flatMap((file) => examplesIn(file).map((name) => [file, name] as const)))(
    "%s teaches --name=%s, which the wrapper accepts",
    (_file, name) => {
      expect(planMigrationGeneration([`--name=${name}`]).ok).toBe(true);
    }
  );
});
