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
  domainFrom,
  findTarget,
  healthy,
  type Request,
  railway,
  refusal,
  type Target,
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

function read(steps: Steps, name: string): Target | null {
  return findTarget(JSON.parse(steps.railway(railway.status())), name);
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

  const existing = read(steps, name);
  if (existing !== null) {
    const reason = refusal(name, existing);
    if (reason !== null) return { ok: false, message: reason };
  }
  // Either leaves the CLI linked to the environment, which is what an apply
  // reads: it takes no environment of its own.
  steps.railway(existing === null ? railway.create(name) : railway.link(name));
  steps.out(existing === null ? `Created   ${name}` : `Using     ${name}, which holds nothing`);

  // Read again, after the link and before the first write.
  const target = read(steps, name);
  if (target === null)
    return {
      ok: false,
      message: `Railway has no "${name}" after creating it.`,
    };
  const reason = refusal(name, target);
  if (reason !== null) return { ok: false, message: reason };

  // The databases file evaluates only for this id, so a link that points
  // anywhere else stops here, before anything is planned.
  steps.railway(railway.applyDatabases(), {
    env: { [TARGET_VARIABLE]: target.id },
  });
  steps.out("Applied   Postgres and Redis");
  steps.railway(railway.applyWeb(), { env: { [BRANCH_VARIABLE]: branch } });
  steps.out(`Applied   the web service, from ${branch}`);

  const domain = domainFrom(JSON.parse(steps.railway(railway.domain(name))));
  if (domain === null) return { ok: false, message: "Railway answered no domain for the site." };

  for (const variable of planned.variables) {
    steps.railway(railway.setVariable(name, variable.name), {
      input: variable.value,
    });
  }
  steps.out(`Set       ${planned.variables.map((variable) => variable.name).join(", ")}`);

  steps.railway(railway.deploy(name));
  steps.out(`Deploying ${domain}`);

  const url = `${domain}/api/health`;
  for (let attempt = 0; attempt < HEALTH_ATTEMPTS; attempt += 1) {
    await steps.wait(HEALTH_INTERVAL_MS);
    if (healthy(await steps.health(url))) {
      return { ok: true, message: `${url} reports the database and Redis ok.` };
    }
  }
  return {
    ok: false,
    message: `${url} did not report the database and Redis ok in time. The environment exists; read its deploy log in Railway.`,
  };
}
