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
  type ApiKey,
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
  /** `packageManager` from package.json. */
  packageManager: string;
  /** Runs an npm script with its output shown, resolving its exit code. */
  runScript: (name: string) => Promise<number>;
  out: (line: string) => void;
  err: (line: string) => void;
};

/** The process exit code. */
export async function runSetup(actions: SetupActions): Promise<number> {
  const { out, err } = actions;

  /**
   * **Everything that can be known is reported before anything is asked or
   * written.** A newcomer who answers two prompts and then learns the `.env` they
   * already had cannot be used has been asked for nothing.
   */
  const npmWarning = npmVersionWarning(actions.userAgent, actions.packageManager);
  if (npmWarning !== null) err(npmWarning);

  const existing = actions.readEnv();
  const plan = planEnv({ existing, example: actions.readExample(), secret: actions.secret });

  if (plan.mismatch !== null) {
    err(plan.mismatch);
    return 1;
  }

  let text = plan.text;

  if (plan.written.length > 0) {
    actions.writeEnv(text);
    out(existing === null ? "Created .env from .env.example:" : "Filled in .env:");
    for (const line of plan.written) out(`  ${line}`);
  } else {
    out(".env already has its database and auth values — nothing regenerated.");
  }

  let missing = missingApiKeys(text);

  if (missing.length > 0 && actions.interactive) {
    text = await askForKeys(actions, text, missing);
    missing = missingApiKeys(text);
  }

  out("");
  out("Starting the database and applying migrations…");
  const migrated = await actions.runScript("db:migrate");
  if (migrated !== 0) {
    err("Migrations failed. The output above says why; fix that and run setup again.");
    return migrated;
  }

  /**
   * A warning, not a stop. The browser is needed by `npm run test:e2e` alone,
   * and a failed download — offline, a proxy — should not keep someone from the
   * dev server they came for.
   */
  out("");
  out("Installing the Playwright browser for the end-to-end suite…");
  if ((await actions.runScript("test:e2e:browser")) !== 0) {
    err("The Playwright browser did not install. Only `npm run test:e2e` needs it —");
    err("run `npm run test:e2e:browser` again later.");
  }

  out("");
  if (missing.length > 0) err(missingKeysMessage(missing));
  const google = missingGoogleMessage(text);
  if (google !== null) err(google);

  out("Setup is done.");

  if (!actions.interactive) {
    out("Start the app with `npm run dev`, then open http://localhost:3000.");
    return 0;
  }

  if (!wantsDevServer(await actions.ask("Start the dev server now? [Y/n] "))) {
    out("Start it later with `npm run dev`.");
    return 0;
  }

  return actions.runScript("dev");
}

/**
 * Asks for each blank key and writes each answer as it is given, so an
 * interrupted run keeps what was already typed.
 */
async function askForKeys(
  actions: SetupActions,
  initial: string,
  missing: readonly ApiKey[]
): Promise<string> {
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
      if (typed === null) return text;

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

  return text;
}
