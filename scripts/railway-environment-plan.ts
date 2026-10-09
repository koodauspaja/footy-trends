/**
 * The decisions behind standing up a new Railway environment, free of the CLI
 * and the network so they can be unit-tested directly.
 *
 * decisions/522-railway-environment-from-code.md
 */
import { databaseNames, PROTECTED_ENVIRONMENT_IDS } from "../.railway/databases";

/**
 * The web service, as `.railway/railway.ts` names it.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const WEB_SERVICE = "footy-trends";

export type Request = { name: string; branch: string };
export type ParsedArgs = { ok: true; request: Request } | { ok: false; message: string };

/**
 * `--name=<environment> [--branch=<branch>]`, the branch defaulting to `main`.
 * A name is lower-case letters, digits and hyphens, as Railway puts it in the
 * site's address.
 *
 * decisions/522-railway-environment-from-code.md
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const flags = new Map<string, string>();
  for (const argument of argv) {
    const match = /^--(name|branch)=(.*)$/.exec(argument);
    if (match === null) return { ok: false, message: `Unrecognised argument: ${argument}` };
    flags.set(match[1] as string, match[2] as string);
  }

  const name = flags.get("name") ?? "";
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(name)) {
    return {
      ok: false,
      message: "--name is required: lower-case letters, digits and hyphens, starting with a letter",
    };
  }

  const branch = flags.get("branch") ?? "main";
  // No leading hyphen, so a branch can never be read as an option by anything
  // it is handed to.
  if (!/^[\w.][\w./-]*$/.test(branch)) {
    return {
      ok: false,
      message: `--branch does not look like a branch: ${branch}`,
    };
  }

  return { ok: true, request: { name, branch } };
}

export type Target = { id: string; services: string[] };

type StatusEnvironment = {
  node?: {
    id?: unknown;
    name?: unknown;
    serviceInstances?: { edges?: { node?: { serviceName?: unknown } }[] };
  };
};

/**
 * The named environment as `railway status --json` describes it, with every
 * service it holds, or `null` when the project has none of that name. Throws
 * on an answer it cannot read: an unreadable environment is not an empty one.
 *
 * decisions/522-railway-environment-from-code.md
 */
export function findTarget(status: unknown, name: string): Target | null {
  const edges = (status as { environments?: { edges?: unknown } } | null)?.environments?.edges;
  if (!Array.isArray(edges)) throw new Error("railway status answered no list of environments");

  const found = (edges as StatusEnvironment[]).find((edge) => edge.node?.name === name)?.node;
  if (found === undefined) return null;

  const instances = found.serviceInstances?.edges;
  if (typeof found.id !== "string" || !Array.isArray(instances)) {
    throw new TypeError(`railway status answered an environment "${name}" it does not describe`);
  }
  return {
    id: found.id,
    services: instances.map((edge) => String(edge.node?.serviceName)),
  };
}

/**
 * Why an environment must not be built into, or `null` when it may: it is
 * this project's staging or production, or it already holds a service.
 *
 * decisions/522-railway-environment-from-code.md
 */
export function refusal(name: string, target: Target): string | null {
  if (PROTECTED_ENVIRONMENT_IDS.includes(target.id)) {
    return `"${name}" is this project's staging or production: this command never touches it.`;
  }
  if (target.services.length > 0) {
    return `"${name}" already holds ${target.services.join(", ")}: this command only builds into an environment that holds nothing.`;
  }
  return null;
}

/**
 * The keys and credentials that cannot be generated: read from the process
 * environment, where the workflow puts the GitHub secrets.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const REQUIRED_SECRETS = [
  "FOOTBALL_DATA_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];
export const OPTIONAL_SECRETS = [
  "TASO_API_KEY",
  "AXIOM_TOKEN",
  "AXIOM_DATASET",
  "NEXT_PUBLIC_SENTRY_DSN",
];

/**
 * Who may sign in. Required everywhere but an environment named `production`,
 * the one name `.railway/railway.ts` gives no such variable.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const SIGN_IN_LIST = "AUTH_ALLOWED_EMAILS";

export type Variable = { name: string; value: string };

// A value Railway resolves inside the environment: another service's variable,
// or one of its own.
const reference = (variable: string) => `$\{{${variable}}}`;
export type Variables = { ok: true; variables: Variable[] } | { ok: false; missing: string[] };

/**
 * Every variable the web service is given, or the required ones that are
 * missing. The two addresses, of this environment's own databases, and the
 * site's own are references Railway resolves; `secret` is this environment's
 * own `BETTER_AUTH_SECRET`.
 *
 * decisions/522-railway-environment-from-code.md
 */
export function variablesFor(
  name: string,
  env: Record<string, string | undefined>,
  secret: string
): Variables {
  const open = name === "production";
  const required = open ? REQUIRED_SECRETS : [...REQUIRED_SECRETS, SIGN_IN_LIST];
  const held = (key: string) => (env[key] ?? "").trim() !== "";

  const missing = required.filter((key) => !held(key));
  if (missing.length > 0) return { ok: false, missing };

  const databases = databaseNames(name);
  const fromEnv = [...required, ...OPTIONAL_SECRETS]
    .filter(held)
    .map((key) => ({ name: key, value: env[key] as string }));

  return {
    ok: true,
    variables: [
      { name: "DATABASE_URL", value: reference(`${databases.postgres}.DATABASE_URL`) },
      { name: "REDIS_URL", value: reference(`${databases.redis}.REDIS_URL`) },
      { name: "BETTER_AUTH_URL", value: `https://${reference("RAILWAY_PUBLIC_DOMAIN")}` },
      { name: "BETTER_AUTH_SECRET", value: secret },
      { name: "FOOTBALL_DATA_EARLIEST_SEASON", value: "2023" },
      { name: "FOOTBALL_DATA_REFRESH_INTERVAL_SECONDS", value: "3600" },
      { name: "LOG_LEVEL", value: "info" },
      ...fromEnv,
    ],
  };
}

/**
 * The site's address from what `railway domain --json` answered, or `null`.
 *
 * decisions/522-railway-environment-from-code.md
 */
export function domainFrom(answer: unknown): string | null {
  const domain = (answer as { domain?: unknown } | null)?.domain;
  return typeof domain === "string" && domain.startsWith("https://") ? domain : null;
}

/**
 * Whether a `/api/health` body says the database and Redis both answered.
 *
 * decisions/522-railway-environment-from-code.md
 */
export function healthy(body: unknown): boolean {
  const checks = (body as { checks?: { database?: unknown; redis?: unknown } } | null)?.checks;
  return checks?.database === "ok" && checks.redis === "ok";
}

/**
 * Every `railway` argument list the command needs, as data, so a test can read
 * them. None carries `--confirm-destructive`: an environment that holds
 * nothing has nothing to delete, so an apply that plans a deletion fails.
 *
 * decisions/522-railway-environment-from-code.md
 */
export const railway = {
  status: () => ["status", "--json"],
  create: (name: string) => ["environment", "new", name, "--json"],
  link: (name: string) => ["environment", "link", name, "--json"],
  applyDatabases: () => ["config", "apply", "--file", ".railway/databases.ts", "--yes"],
  applyWeb: () => ["config", "apply", "--file", ".railway/railway.ts", "--yes"],
  domain: (name: string) => ["domain", "--service", WEB_SERVICE, "--environment", name, "--json"],
  // The value arrives on stdin, so it is in no argument list and no log.
  setVariable: (name: string, variable: string) => [
    "variable",
    "set",
    variable,
    "--stdin",
    "--skip-deploys",
    "--service",
    WEB_SERVICE,
    "--environment",
    name,
    "--json",
  ],
  deploy: (name: string) => [
    "redeploy",
    "--service",
    WEB_SERVICE,
    "--environment",
    name,
    "--from-source",
    "--yes",
    "--json",
  ],
};
