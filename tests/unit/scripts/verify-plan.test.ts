import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  failureMessage,
  humanDuration,
  isWorkflowFile,
  NOT_A_STAGE,
  passedLine,
  type Stage,
  stagesMissingFrom,
  startingLine,
  successMessage,
  VERIFY_STAGES,
  workflowScripts,
} from "../../../scripts/verify-plan";

const WORKFLOWS = "./.github/workflows";

function everyWorkflowScript(): string[] {
  return readdirSync(WORKFLOWS)
    .filter(isWorkflowFile)
    .flatMap((file) => workflowScripts(readFileSync(path.join(WORKFLOWS, file), "utf8")));
}

describe("VERIFY_STAGES", () => {
  /**
   * #401's own warning, as a mechanism: a command that can disagree with the
   * workflows is worse than no command, because it reports green for a state CI
   * rejects. The list is duplicated rather than derived — a workflow parsed at
   * runtime would make an edit there break the local command — so this fails the
   * moment the two drift.
   */
  it("covers every npm script the workflows run", () => {
    expect(stagesMissingFrom(everyWorkflowScript())).toEqual([]);
  });

  it("names a reason for each script it deliberately leaves out", () => {
    const run = new Set(everyWorkflowScript());

    for (const [script, reason] of Object.entries(NOT_A_STAGE)) {
      // A stale exemption is how the guard above stops meaning anything.
      expect(run, `${script} is exempted but no workflow runs it`).toContain(script);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("reports a script no stage covers", () => {
    expect(stagesMissingFrom(["lint", "test:unit", "something:new"])).toEqual(["something:new"]);
  });

  it("lists what is missing in a stable order, and each name once", () => {
    // The message is read by a person comparing two runs, so the order cannot
    // depend on which workflow happened to be parsed first.
    expect(stagesMissingFrom(["zeta:task", "alpha:task", "zeta:task", "lint"])).toEqual([
      "alpha:task",
      "zeta:task",
    ]);
  });

  it("puts the slowest stage last, so a failure arrives as early as it can", () => {
    expect(VERIFY_STAGES.at(0)?.script).toBe("lint");
    expect(VERIFY_STAGES.at(-1)?.script).toBe("test:e2e");
  });

  it("runs scripts that package.json actually defines", () => {
    const { scripts } = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    for (const stage of VERIFY_STAGES) {
      expect(Object.keys(scripts), stage.script).toContain(stage.script);
    }
  });
});

describe("workflowScripts", () => {
  it("finds the scripts a workflow step runs", () => {
    const workflow = ["      - name: Unit tests", "        run: npm run test:unit"].join("\n");

    expect(workflowScripts(workflow)).toEqual(["test:unit"]);
  });

  it("reads colons and dashes in a script name", () => {
    expect(workflowScripts("run: npm run test:e2e:browser")).toEqual(["test:e2e:browser"]);
  });

  it("finds nothing in a workflow that runs no npm script", () => {
    expect(workflowScripts("run: npm ci --ignore-scripts")).toEqual([]);
  });

  it("reads a script name made of characters a narrower pattern would drop", () => {
    // `[\w:-]+` read these as no script at all, so a workflow could gain a
    // stage while the audit stayed quiet. Raised in review on #410.
    expect(workflowScripts("run: npm run lint.fix")).toEqual(["lint.fix"]);
    expect(workflowScripts("run: npm run deploy@staging")).toEqual(["deploy@staging"]);
  });

  it("stops at the first space, so flags are not read as part of the name", () => {
    expect(workflowScripts("run: npm run test:unit -- --coverage")).toEqual(["test:unit"]);
  });

  it("finds both scripts when a step chains two", () => {
    expect(workflowScripts("run: npm run lint && npm run typecheck")).toEqual([
      "lint",
      "typecheck",
    ]);
  });
});

describe("isWorkflowFile", () => {
  it.each(["ci.yml", "release.yaml"])("counts %s, because GitHub accepts both", (name) => {
    expect(isWorkflowFile(name)).toBe(true);
  });

  it.each(["README.md", "ci.yml.bak", "notes.txt"])("does not count %s", (name) => {
    expect(isWorkflowFile(name)).toBe(false);
  });
});

describe("humanDuration", () => {
  it.each([
    [0, "0.0s"],
    [1500, "1.5s"],
    [59_400, "59.4s"],
    [60_000, "1m 0s"],
    [225_000, "3m 45s"],
  ])("reads %i ms as %s", (milliseconds, expected) => {
    expect(humanDuration(milliseconds)).toBe(expected);
  });
});

describe("the lines it prints", () => {
  const stage: Stage = { name: "Unit tests", script: "test:unit", typical: "~40s" };

  it("says which stage is starting, and how long it usually takes", () => {
    expect(startingLine(stage, 3, 6)).toBe("[3/6] Unit tests — npm run test:unit (~40s)");
  });

  it("says how long it took when it passes", () => {
    expect(passedLine(stage, 41_200)).toContain("Unit tests passed in 41.2s");
  });

  it("names the failing stage and the command to run it alone", () => {
    const message = failureMessage(stage, 41_200);

    expect(message).toContain("Unit tests failed after 41.2s");
    expect(message).toContain("npm run test:unit");
    expect(message).toContain("did not run");
  });

  it("counts the stages it ran when they all pass", () => {
    expect(successMessage(VERIFY_STAGES, 300_000)).toBe("All 6 stages passed in 5m 0s.");
  });
});
