/**
 * What `npm run setup` *does*, in order — once `scripts/setup` has found Node
 * and a `docker compose` runtime and installed the dependencies.
 *
 * Separate from `setup.ts` so that it can be tested: every action is injected,
 * so a test drives the whole sequence without a terminal, a file or a container.
 * The shape `preflight.ts` has.
 *
 * **The containers and migrations are not done here.** `npm run db:migrate`
 * already starts what it needs through #399's preflight, and a second copy of
 * that logic would be the one that drifts.
 */
import {
  exportedOverrideMessage,
  missingApiKeys,
  missingGoogleMessage,
  missingKeysMessage,
  npmVersionWarning,
  planEnv,
  readKeyInput,
  setEnvValue,
  wantsDevServer,
} from "./setup-plan";

export type SetupActions = {
  /** `.env`, or `null` when there is none yet. */
  readEnv: () => string | null;
  readExample: () => string;
  writeEnv: (text: string) => void;
  /** A fresh random value, for a password or a signing secret. */
  secret: () => string;
  /** Whether anyone is there to answer. Without a terminal nothing is asked. */
  interactive: boolean;
  /** The answer, or `null` when input has ended and none can be given. */
  ask: (question: string) => Promise<string | null>;
  /** `npm_config_user_agent`, which says which npm is running this. */
  userAgent: string;
  /**
   * The environment this was started with, for the variables an export would
   * let win over the `.env` being written.
   */
  exported: NodeJS.Dict<string>;
  /** `packageManager` from package.json. */
  packageManager: string;
  /**
   * Tightens `.env` to owner-only, for the run where nothing needed writing.
   * A file that already had every value keeps its permissions otherwise, and
   * `cp .env.example .env` makes a world-readable one. Raised in review on #409.
   */
  secureEnv: () => void;
  /** Runs an npm script with its output shown, resolving its exit code. */
  runScript: (name: string) => Promise<number>;
  out: (line: string) => void;
  err: (line: string) => void;
};

/** The process exit code. */
export async function runSetup(actions: SetupActions): Promise<number> {
  const prepared = writeEnvFile(actions);
  if (prepared === null) return 1;
  if (exportWins(actions, prepared)) return 1;

  const keys = actions.interactive
    ? await askForKeys(actions, prepared)
    : { text: prepared, inputEnded: false };
  const text = keys.text;

  actions.out("");
  actions.out("Starting the database and applying migrations…");
  const migrated = await actions.runScript("db:migrate");
  if (migrated !== 0) {
    actions.err("Migrations failed. The output above says why; fix that and run setup again.");
    return migrated;
  }

  await installBrowser(actions);
  reportWhatIsMissing(actions, text);

  return startServer(actions, keys.inputEnded);
}

/**
 * The `.env`, written if it needed anything — or `null` when setup cannot go on,
 * having said why.
 *
 * **Everything that can be known is reported before anything is asked or
 * written.** Nobody should answer two key prompts and only then be told that the
 * `.env` they already had cannot be used.
 */
function writeEnvFile(actions: SetupActions): string | null {
  const npmWarning = npmVersionWarning(actions.userAgent, actions.packageManager);
  if (npmWarning !== null) actions.err(npmWarning);

  const existing = actions.readEnv();
  const plan = planEnv({ existing, example: actions.readExample(), secret: actions.secret });

  if (plan.stop !== null) {
    actions.err(plan.stop);
    return null;
  }

  if (plan.written.length === 0) {
    actions.out(".env already has its database and auth values — nothing regenerated.");
    // Nothing to write, but its permissions are still setup's business: this is
    // the rerun against a `.env` that was copied by hand, and left 0644.
    actions.secureEnv();
    return plan.text;
  }

  actions.writeEnv(plan.text);
  actions.out(existing === null ? "Created .env from .env.example:" : "Filled in .env:");
  for (const line of plan.written) actions.out(`  ${line}`);
  return plan.text;
}

/**
 * Whether an exported variable would make the file that was just written a lie.
 *
 * Checked after writing and before anything is run or asked: the `.env` is
 * correct and worth keeping, and the next run finds it complete once the export
 * is gone.
 */
function exportWins(actions: SetupActions, text: string): boolean {
  const conflict = exportedOverrideMessage(actions.exported, text);
  if (conflict === null) return false;

  actions.err(conflict);
  return true;
}

/**
 * A warning, not a stop. The browser is needed by `npm run test:e2e` alone, and
 * a failed download — offline, a proxy — should not keep someone from the dev
 * server they came for.
 */
async function installBrowser(actions: SetupActions): Promise<void> {
  actions.out("");
  actions.out("Installing the Playwright browser for the end-to-end suite…");

  if ((await actions.runScript("test:e2e:browser")) !== 0) {
    actions.err("The Playwright browser did not install. Only `npm run test:e2e` needs it —");
    actions.err("run `npm run test:e2e:browser` again later.");
  }
}

/** What is still unset, and what that costs — said at the end, where it is read. */
function reportWhatIsMissing(actions: SetupActions, text: string): void {
  actions.out("");

  const missing = missingApiKeys(text);
  if (missing.length > 0) actions.err(missingKeysMessage(missing));

  const google = missingGoogleMessage(text);
  if (google !== null) actions.err(google);

  actions.out("Setup is done.");
}

async function startServer(actions: SetupActions, inputEnded: boolean): Promise<number> {
  /**
   * `inputEnded` is not the same as "not interactive": there is a terminal, but
   * whoever was at it pressed Ctrl-D. Asking one more question into a stream
   * that has ended would get the same answer, which is no answer at all.
   */
  if (!actions.interactive || inputEnded) {
    actions.out("Start the app with `npm run dev`, then open http://localhost:3000.");
    return 0;
  }

  if (!wantsDevServer(await actions.ask("Start the dev server now? [Y/n] "))) {
    actions.out("Start it later with `npm run dev`.");
    return 0;
  }

  return actions.runScript("dev");
}

/** The `.env` after the prompts, and whether input ended part-way through them. */
type KeyAnswers = { text: string; inputEnded: boolean };

/**
 * Asks for each blank key and writes each answer as it is given, so an
 * interrupted run keeps what was already typed.
 */
async function askForKeys(actions: SetupActions, initial: string): Promise<KeyAnswers> {
  const missing = missingApiKeys(initial);
  if (missing.length === 0) return { text: initial, inputEnded: false };

  let text = initial;

  actions.out("");
  actions.out("Two API keys come from outside the repository. Both are optional —");
  actions.out("press Enter to skip one and add it to .env later.");

  for (const key of missing) {
    actions.out("");
    actions.out(`${key.name}: ${key.source}`);
    actions.out(`Without it: ${key.without}.`);

    for (;;) {
      const typed = await actions.ask(`${key.name}: `);

      /**
       * End of input: not an answer to this question, and not to the next one
       * either. Asking again would prompt into a stream that has ended.
       */
      if (typed === null) return { text, inputEnded: true };

      const answer = readKeyInput(typed);
      if (answer.kind === "skip") break;
      if (answer.kind === "invalid") {
        actions.err(
          "That does not look like a key — no spaces, quotes or #. Try again, or press Enter."
        );
        continue;
      }
      text = setEnvValue(text, key.name, answer.value);
      actions.writeEnv(text);
      break;
    }
  }

  return { text, inputEnded: false };
}
