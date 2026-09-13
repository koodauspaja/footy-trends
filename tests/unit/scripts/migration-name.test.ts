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

  it("refuses two names rather than guessing which one wins", () => {
    // A filter takes the first and a command-line parser generally takes the
    // last, so guessing would validate one name and generate the other.
    const plan = planMigrationGeneration(["--name=add_one", "--name=add_two"]);

    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.message).toContain("--name given 2 times");
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
