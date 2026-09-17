/**
 * What `npm run verify` *does*: each stage in turn, stopping at the first
 * failure and naming it (#401).
 *
 * Separate from `verify.ts` so it can be tested — every action is injected, so a
 * test drives the whole sequence without running a suite. The shape
 * `setup-steps.ts` has.
 */
import { run } from "./services-run";
import { notRunByNpmMessage, npmCliFrom } from "./setup-wiring";
import {
  failureMessage,
  passedLine,
  type Stage,
  startingLine,
  successMessage,
  VERIFY_STAGES,
} from "./verify-plan";

export type VerifyActions = {
  stages: readonly Stage[];
  /** Runs an npm script with its output shown, resolving its exit code. */
  runScript: (name: string) => Promise<number>;
  /** Milliseconds from some fixed point — `Date.now` in the real thing. */
  now: () => number;
  out: (line: string) => void;
  err: (line: string) => void;
};

/** The process exit code: the failing stage's own, or 0. */
export async function runVerify(actions: VerifyActions): Promise<number> {
  const started = actions.now();

  for (const [index, stage] of actions.stages.entries()) {
    actions.out(startingLine(stage, index + 1, actions.stages.length));

    const stageStarted = actions.now();
    const code = await actions.runScript(stage.script);
    const elapsed = actions.now() - stageStarted;

    if (code !== 0) {
      actions.err(failureMessage(stage, elapsed));
      /**
       * The stage's own code, not 1: `npm run verify` is what CI and a
       * pre-push hook would read, and a suite that exits 2 has said something
       * different from one that exits 1.
       */
      return code;
    }

    actions.out(passedLine(stage, elapsed));
  }

  actions.out(successMessage(actions.stages, actions.now() - started));
  return 0;
}

/** The real runner, with npm reached by its own path rather than through `PATH`. */
export function verifyActions(npmCli: string): VerifyActions {
  return {
    stages: VERIFY_STAGES,
    runScript: (name) => run(process.execPath, [npmCli, "run", name]),
    now: () => Date.now(),
    out: (line) => process.stdout.write(`${line}\n`),
    err: (line) => process.stderr.write(`\n${line}\n`),
  };
}

/** The whole of `npm run verify`, from the real world in. Returns the exit code. */
export async function startVerify(): Promise<number> {
  const npmCli = npmCliFrom(process.env);

  if (npmCli === null) {
    process.stderr.write(`${notRunByNpmMessage()}\n`);
    return 1;
  }

  return runVerify(verifyActions(npmCli));
}
