/**
 * What `npm run setup` decides — the `.env` it writes, which values it keeps,
 * and what it says about the ones it cannot fill in. Free of the filesystem, the
 * network and `process`, so every rule here is tested directly; the split
 * `services-plan.ts` follows.
 *
 * **Why the password is generated rather than shipped (#400).** Everything in
 * `DATABASE_URL` except the password is already fixed by `docker-compose.yml`,
 * and `.env.example` is tracked, which #292 deliberately took credentials out
 * of. Writing one generated value into both `FOOTY_POSTGRES_PASSWORD` and
 * `DATABASE_URL` at once also removes the mismatch `.env.example` used to warn
 * about: the two halves cannot disagree when one hand writes both.
 */
import { parseEnv } from "node:util";
import {
  COMPOSE_DATABASE_NAME,
  COMPOSE_POSTGRES_PORT,
  COMPOSE_POSTGRES_USER,
  runsOnComposeServer,
} from "./services-plan";

/**
 * The value `.env.example` shipped for `DATABASE_URL` until #400.
 *
 * Counted as unset, because a `.env` copied from it by hand — the old Quick
 * Start — carries it still, and it names a user the container never had. Left in
 * place it would be kept as though somebody had chosen it.
 */
export const LEGACY_DATABASE_URL = "postgresql://user:password@localhost:5432/footy-trends";

/** Where `npm run dev` serves, which is what better-auth must be told locally. */
export const LOCAL_AUTH_URL = "http://localhost:3000";

/** The connection string for the compose database, with this password. */
export function composeDatabaseUrl(password: string): string {
  const url = new URL(`postgresql://localhost:${COMPOSE_POSTGRES_PORT}/`);
  url.username = COMPOSE_POSTGRES_USER;
  /**
   * Encoded here, because the setter does not do it completely: measured on
   * Node 24, `%` passes through untouched and the result no longer decodes.
   * A generated password never contains one, but a password adopted from an
   * existing `.env` might.
   */
  url.password = encodeURIComponent(password);
  url.pathname = `/${COMPOSE_DATABASE_NAME}`;
  return url.toString();
}

/**
 * The password in a URL that names the compose server as its user, or `null`
 * when the URL is about something else and so says nothing about this one.
 */
export function composePasswordOf(url: string): string | null {
  if (!runsOnComposeServer(url)) return null;

  try {
    const parsed = new URL(url);
    if (decodeURIComponent(parsed.username) !== COMPOSE_POSTGRES_USER) return null;
    return decodeURIComponent(parsed.password);
  } catch {
    // `runsOnComposeServer` has already parsed it, so only a malformed escape in
    // the credential lands here — which is not a password anyone could be using.
    return null;
  }
}

/** A variable name as `.env` files spell them. */
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/**
 * What this module will write as a value unquoted.
 *
 * Narrower than what an `.env` parser accepts, on purpose. Measured against
 * Node's `parseEnv`: `#` starts a comment **even with no space before it**, so
 * `KEY=a#b` reads back as `a`, and whitespace is trimmed from the ends. Anything
 * outside this set would be written as one value and read back as another.
 */
const ENV_VALUE = /^[A-Za-z0-9._~%:/@+=-]*$/;

/**
 * `text` with `name` set to `value`: every existing assignment replaced, or one
 * appended when there is none. Every other line — comments included — is left
 * exactly as it was.
 *
 * **Every assignment, not the first.** A later duplicate wins when the file is
 * read, so replacing only the first would write a value nothing ever sees.
 *
 * Throws on a value it cannot write faithfully rather than writing a different
 * one. Nothing reaches here unchecked — keys are screened by `readKeyInput` and
 * the rest are generated — so a throw is a bug in this module, not an input.
 */
/**
 * Whether `setEnvValue` can write this value without changing it.
 *
 * Asked **before** writing wherever the value came from outside this module: an
 * adopted password is the one case, and it arrives already decoded.
 */
export function canWriteEnvValue(value: string): boolean {
  return ENV_VALUE.test(value);
}

export function setEnvValue(text: string, name: string, value: string): string {
  if (!ENV_NAME.test(name)) throw new Error(`Not an environment variable name: ${name}`);
  if (!canWriteEnvValue(value)) throw new Error(`Cannot write ${name} unquoted`);

  const assignment = new RegExp(String.raw`^[ \t]*${name}[ \t]*=[^\r\n]*`, "gm");
  if (assignment.test(text)) {
    // A function, not a string: `$&` and `$1` in a replacement string are
    // patterns. `ENV_VALUE` refuses `$` today, and this keeps widening that set
    // from quietly changing what gets written.
    return text.replace(assignment, () => `${name}=${value}`);
  }

  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  return `${text}${separator}${name}=${value}\n`;
}

/**
 * A variable's value as the application will read it, with blank meaning unset.
 *
 * `parseEnv` types its result with optional values, and an absent variable and
 * an empty one mean the same thing here: nothing has been set.
 */
function settingOf(values: NodeJS.Dict<string>, name: string): string {
  return (values[name] ?? "").trim();
}

export type EnvPlan = {
  text: string;
  /**
   * What this run wrote, for the report — names and how each was arrived at,
   * **never the value**. This is printed, and it is mostly credentials.
   */
  written: string[];
  /**
   * Why setup cannot go on, or `null`. Two states reach it, and neither can be
   * settled from here: the two halves of the credential disagree, or the
   * password already in use cannot be written into `.env` as it stands.
   */
  stop: string | null;
};

/**
 * The `.env` to write, from the one already there or else from `.env.example`.
 *
 * **Nothing already set is replaced.** That is what makes a second run safe: the
 * password is the one a Postgres volume was initialised with, and regenerating
 * it would lock the developer out of their own database with nothing pointing
 * at why.
 */
export function planEnv({
  existing,
  example,
  secret,
}: {
  existing: string | null;
  example: string;
  secret: () => string;
}): EnvPlan {
  const original = existing ?? example;
  const values = parseEnv(original);

  const url = settingOf(values, "DATABASE_URL");
  const urlUnset = url === "" || url === LEGACY_DATABASE_URL;

  const choice = choosePassword({
    configured: settingOf(values, "FOOTY_POSTGRES_PASSWORD"),
    inUrl: urlUnset ? null : composePasswordOf(url),
    secret,
  });

  if (choice.kind === "stop") return { text: original, written: [], stop: choice.message };

  let text = original;
  const written: string[] = [];

  if (choice.note !== null) {
    text = setEnvValue(text, "FOOTY_POSTGRES_PASSWORD", choice.password);
    written.push(choice.note);
  }

  if (urlUnset) {
    text = setEnvValue(text, "DATABASE_URL", composeDatabaseUrl(choice.password));
    written.push("DATABASE_URL (the compose database, with that password)");
  }

  for (const filler of [
    { name: "BETTER_AUTH_SECRET", value: secret, note: "BETTER_AUTH_SECRET (generated)" },
    {
      name: "BETTER_AUTH_URL",
      value: () => LOCAL_AUTH_URL,
      note: `BETTER_AUTH_URL (${LOCAL_AUTH_URL})`,
    },
  ]) {
    if (settingOf(values, filler.name) !== "") continue;
    text = setEnvValue(text, filler.name, filler.value());
    written.push(filler.note);
  }

  return { text, written, stop: disagreement(choice.password, urlUnset ? null : url) };
}

/**
 * Which password this `.env` should carry, or why setup cannot say.
 *
 * `note` is what the report will call it, and `null` means it was already there
 * and nothing is being written.
 */
type PasswordChoice =
  | { kind: "ready"; password: string; note: string | null }
  | { kind: "stop"; message: string };

function choosePassword({
  configured,
  inUrl,
  secret,
}: {
  configured: string;
  inUrl: string | null;
  secret: () => string;
}): PasswordChoice {
  if (configured !== "") return { kind: "ready", password: configured, note: null };

  /**
   * **A password already in `DATABASE_URL` is adopted, not replaced.** A `.env`
   * from before #292 holds the compose credential only there — and the volume
   * was initialised with it, so a fresh one would be a different password for
   * the same database.
   */
  if (inUrl !== null && inUrl !== "") {
    /**
     * **This is the one value here that comes from outside**, and it arrives
     * decoded: `…:ab%23cd@…` is the password `ab#cd`, which `.env` cannot carry
     * unquoted. Writing it anyway threw, so setup died on an existing `.env` it
     * was meant to repair. Raised in review on #409.
     */
    if (!canWriteEnvValue(inUrl)) return { kind: "stop", message: unwritablePasswordMessage() };

    return {
      kind: "ready",
      password: inUrl,
      note: "FOOTY_POSTGRES_PASSWORD (taken from DATABASE_URL)",
    };
  }

  return { kind: "ready", password: secret(), note: "FOOTY_POSTGRES_PASSWORD (generated)" };
}

/**
 * Whether a `DATABASE_URL` that was left as it was still agrees with the
 * password. A URL for some other server is a choice, and its password is not
 * ours to compare — Homebrew Postgres, a devcontainer, a remote database.
 */
function disagreement(password: string, url: string | null): string | null {
  if (url === null) return null;

  const inUrl = composePasswordOf(url);
  return inUrl !== null && inUrl !== password ? mismatchMessage() : null;
}

/**
 * Deliberately says which value to change and not which is right: only the
 * developer knows which one their Postgres volume was initialised with.
 */
export function mismatchMessage(): string {
  return [
    "FOOTY_POSTGRES_PASSWORD and the password in DATABASE_URL disagree.",
    "",
    "They are two halves of one credential, and migrations would fail with a",
    "connection error. Nothing was changed, because only you know which one the",
    "Postgres volume was created with. Make them match in .env — or, if the local",
    "database holds nothing worth keeping, `npm run db:reset:dev` recreates it —",
    "then run setup again.",
  ].join("\n");
}

/**
 * The variables that decide which database the commands after this one talk to.
 *
 * Only these two: the rest of `.env` can be overridden in a shell without
 * anything silently pointing elsewhere.
 */
export const DATABASE_VARIABLES = ["DATABASE_URL", "FOOTY_POSTGRES_PASSWORD"] as const;

/**
 * Why an exported variable makes the `.env` just written a lie, or `null`.
 *
 * **An export beats the file, everywhere setup hands off to.**
 * `process.loadEnvFile` does not overwrite a variable that is already set, and
 * Compose gives a shell export precedence over `.env` — which is what
 * `.env.example` already says about the `FOOTY_` prefix. So `npm run db:migrate`
 * would migrate the exported database while `.env` described another, and the
 * dev server would then read the file's. Raised in review on #409.
 *
 * An export that **agrees** with the file is not a conflict, so it says nothing.
 */
export function exportedOverrideMessage(
  exported: NodeJS.Dict<string>,
  envText: string
): string | null {
  const values = parseEnv(envText);
  const conflicting = DATABASE_VARIABLES.filter((name) => {
    const shell = (exported[name] ?? "").trim();
    return shell !== "" && shell !== settingOf(values, name);
  });

  if (conflicting.length === 0) return null;

  return [
    `${conflicting.join(" and ")} ${conflicting.length === 1 ? "is" : "are"} exported in this shell,`,
    "and what is exported wins over .env for everything setup runs next.",
    "",
    "Migrations would go to the exported database while .env described another, so",
    `.env has been written and nothing else was run. Either \`unset ${conflicting.join(" ")}\``,
    "and run setup again, or make the exported values match the file.",
  ].join("\n");
}

/**
 * When the password in use cannot go into `.env` as an unquoted value.
 *
 * Setup stops rather than writing a different password: the one in
 * `DATABASE_URL` is what the Postgres volume was initialised with, and a
 * substitute would fail to connect while looking deliberate.
 */
export function unwritablePasswordMessage(): string {
  return [
    "The password in DATABASE_URL cannot be written into .env as it stands —",
    "it contains a character that would be read back as something else, such as",
    "a `#`, a quote or a space.",
    "",
    "Set FOOTY_POSTGRES_PASSWORD yourself, quoted, to the same password that is",
    "already in DATABASE_URL — for example FOOTY_POSTGRES_PASSWORD='p#ss word' —",
    "then run setup again. It is left to you because that password is the one the",
    "Postgres volume was created with, and no other value will connect to it.",
  ].join("\n");
}

export type ApiKey = {
  name: string;
  /** Where the key comes from, so the prompt can say. */
  source: string;
  /** What does not work without it. */
  without: string;
};

/**
 * The two values that genuinely come from outside the repository.
 *
 * Both optional: the dev server starts without them. The pages are named here
 * because "some pages will not work" sends a newcomer looking for a bug.
 */
export const API_KEYS: readonly ApiKey[] = [
  {
    name: "FOOTBALL_DATA_API_KEY",
    source: "free registration at football-data.org — docs/setup/007-football-data-api.md",
    without: "foreign leagues (/ulkomaat) and the World Cup and Euro pages",
  },
  {
    name: "TASO_API_KEY",
    source: "read from tulospalvelu.palloliitto.fi — docs/setup/020-taso-api-key.md",
    without: "Finnish competitions (/kotimaa) and Finland's national teams",
  },
];

/** The API keys this `.env` leaves blank. */
export function missingApiKeys(text: string): ApiKey[] {
  const values = parseEnv(text);
  return API_KEYS.filter((key) => settingOf(values, key.name) === "");
}

/** Characters an API key is made of — the same set a value may be written with. */
const KEY_INPUT = /^[A-Za-z0-9._~+/=-]+$/;

export type KeyInput = { kind: "skip" } | { kind: "key"; value: string } | { kind: "invalid" };

/**
 * One answer to a key prompt. Empty skips, because both keys are optional.
 *
 * Anything with a space, a quote or a `#` is refused rather than written: see
 * `ENV_VALUE` for how such a value would come back changed.
 */
export function readKeyInput(input: string): KeyInput {
  const trimmed = input.trim();
  if (trimmed === "") return { kind: "skip" };
  return KEY_INPUT.test(trimmed) ? { kind: "key", value: trimmed } : { kind: "invalid" };
}

export function missingKeysMessage(missing: readonly ApiKey[]): string {
  return [
    "Not set, so these will show no data until they are:",
    ...missing.map((key) => `  ${key.name} — ${key.without}. From: ${key.source}`),
    "",
    "The dev server runs without them. `npm run test:e2e` does not: it refuses to",
    "start until both are set. Add them to .env whenever you have them.",
  ].join("\n");
}

/** Signing in is the one thing a blank Google client breaks; every page works signed out. */
export function missingGoogleMessage(text: string): string | null {
  const values = parseEnv(text);
  const blank = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"].filter(
    (name) => settingOf(values, name) === ""
  );
  if (blank.length === 0) return null;

  return [
    `${blank.join(" and ")} not set, so signing in will fail. Everything else works`,
    "signed out. See docs/setup/014-google-oauth-setup.md.",
  ].join("\n");
}

/**
 * The npm version running this, from `npm_config_user_agent` —
 * `npm/12.0.1 node/v24.16.0 darwin arm64 workspaces/false`.
 */
export function npmVersionFromUserAgent(userAgent: string): string | null {
  return /^npm\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(userAgent)?.[1] ?? null;
}

/**
 * A warning when npm is not the version `packageManager` pins, or `null`.
 *
 * A warning, not a stop: the install has already happened by the time this
 * runs, and most differences are harmless. It is said because the lockfile is
 * what a different npm quietly rewrites.
 *
 * **Why not `corepack enable`**, which #400 suggested: corepack is no longer
 * bundled from Node 25, so a setup built on it would stop working at the next
 * Node upgrade. Naming the command is the part that survives.
 */
export function npmVersionWarning(userAgent: string, packageManager: string): string | null {
  const pinned = /^npm@(\d+\.\d+\.\d+)$/.exec(packageManager)?.[1];
  if (pinned === undefined) return null;

  const running = npmVersionFromUserAgent(userAgent);
  if (running === pinned) return null;

  return [
    `package.json pins npm ${pinned}; this is ${running ?? "an unknown npm"}.`,
    `Install the pinned one with: npm install -g npm@${pinned}`,
  ].join("\n");
}

/**
 * Only a clear yes, or just Enter, starts the server — the prompt says `[Y/n]`.
 *
 * `null` is end of input rather than agreement: nobody pressing Ctrl-D is asking
 * for a dev server to be started in front of them.
 */
export function wantsDevServer(answer: string | null): boolean {
  return answer !== null && ["", "y", "yes"].includes(answer.trim().toLowerCase());
}
