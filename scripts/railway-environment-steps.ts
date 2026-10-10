/**
 * Stands up a new Railway environment: its own Postgres and Redis, the web
 * service wired to them, its variables, and a first deploy that answers
 * `/api/health`. The CLI, the network and the clock are injected.
 *
 * decisions/522-railway-environment-from-code.md
 */
import { TARGET_VARIABLE } from "../.railway/databases";
import { BRANCH_VARIABLE } from "../.railway/railway";
import {
  collision,
  domainFrom,
  findTarget,
  healthy,
  idle,
  type Request,
  railway,
  refusal,
  variablesFor,
} from "./railway-environment-plan";

export type Steps = {
  /** Runs the Railway CLI and answers what it printed; throws when it fails. */
  railway: (args: string[], options?: { input?: string; env?: Record<string, string> }) => string;
  /** Where the keys and credentials are read from. */
  env: Record<string, string | undefined>;
  /** A new `BETTER_AUTH_SECRET`. */
  secret: () => string;
  /** The parsed body of one request, or `null` when nothing usable answered. */
  health: (url: string) => Promise<unknown>;
  wait: (milliseconds: number) => Promise<void>;
  out: (line: string) => void;
};

export type Outcome = { ok: boolean; message: string };

/**
 * How long the first deploy is given to answer: a build, the migrations and
 * the health check, with room to spare.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const HEALTH_ATTEMPTS = 60;
export const HEALTH_INTERVAL_MS = 15_000;

/**
 * How long the deploy that applying the web service starts is given to end:
 * it fails its build within a minute, having no variables yet.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const IDLE_ATTEMPTS = 40;
export const IDLE_INTERVAL_MS = 15_000;

function status(steps: Steps): unknown {
  return JSON.parse(steps.railway(railway.status()));
}

/**
 * Whether the web service has no deployment under way within `attempts` waits.
 * Two builds of one service at once share its build cache, and the second
 * fails there on a file the first is moving.
 *
 * decisions/522-railway-environment-from-code.md
 */
async function quiet(steps: Steps, name: string, attempts: number): Promise<boolean> {
  if (idle(JSON.parse(steps.railway(railway.deployments(name))))) return true;
  if (attempts === 0) return false;
  await steps.wait(IDLE_INTERVAL_MS);
  return quiet(steps, name, attempts - 1);
}

/**
 * Whether the site reports itself healthy within `attempts` tries, waiting
 * before each: one after another, since each try is only worth making once
 * the one before has failed.
 *
 * decisions/522-railway-environment-from-code.md
 */
async function answers(steps: Steps, url: string, attempts: number): Promise<boolean> {
  if (attempts === 0) return false;
  await steps.wait(HEALTH_INTERVAL_MS);
  if (healthy(await steps.health(url))) return true;
  return answers(steps, url, attempts - 1);
}

/**
 * The whole command. Nothing is created until every required key is present,
 * and nothing is written to an environment that was not read as empty
 * immediately before.
 *
 * decisions/522-railway-environment-from-code.md
 */
export async function standUp({ name, branch }: Request, steps: Steps): Promise<Outcome> {
  const planned = variablesFor(name, steps.env, steps.secret());
  if (!planned.ok) {
    return {
      ok: false,
      message: `Not set, and required: ${planned.missing.join(", ")}`,
    };
  }

  const first = status(steps);
  const existing = findTarget(first, name);
  if (existing !== null) {
    const reason = refusal(name, existing);
    if (reason !== null) return { ok: false, message: reason };
  }
  const taken = collision(first, name);
  if (taken !== null) return { ok: false, message: taken };
  // Either leaves the CLI linked to the environment, which is what an apply
  // reads: it takes no environment of its own.
  steps.railway(existing === null ? railway.create(name) : railway.link(name));
  steps.out(existing === null ? `Created   ${name}` : `Using     ${name}, which holds nothing`);

  // Read again, after the link and before the first write.
  const target = findTarget(status(steps), name);
  if (target === null)
    return {
      ok: false,
      message: `Railway has no "${name}" after creating it.`,
    };
  const reason = refusal(name, target);
  if (reason !== null) return { ok: false, message: reason };

  // Both files are told this id, and neither evaluates for another: a link
  // that points anywhere else, or moves between the two, stops the apply
  // before anything is planned.
  const env = { [TARGET_VARIABLE]: target.id, [BRANCH_VARIABLE]: branch };
  steps.railway(railway.applyDatabases(), { env });
  steps.out("Applied   Postgres and Redis");
  steps.railway(railway.applyWeb(), { env });
  steps.out(`Applied   the web service, from ${branch}`);

  const domain = domainFrom(JSON.parse(steps.railway(railway.domain(name))));
  if (domain === null) return { ok: false, message: "Railway answered no domain for the site." };

  for (const variable of planned.variables) {
    steps.railway(railway.setVariable(name, variable.name), {
      input: variable.value,
    });
  }
  steps.out(`Set       ${planned.variables.map((variable) => variable.name).join(", ")}`);

  if (!(await quiet(steps, name, IDLE_ATTEMPTS))) {
    return {
      ok: false,
      message: `The deploy that applying the web service started has not ended. The environment exists; redeploy "${name}" in Railway once it has.`,
    };
  }
  steps.railway(railway.deploy(name));
  steps.out(`Deploying ${domain}`);

  const url = `${domain}/api/health`;
  if (await answers(steps, url, HEALTH_ATTEMPTS)) {
    return { ok: true, message: `${url} reports the database and Redis ok.` };
  }
  return {
    ok: false,
    message: `${url} did not report the database and Redis ok in time. The environment exists; read its deploy log in Railway.`,
  };
}
