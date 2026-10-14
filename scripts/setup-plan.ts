/**
 * What `npm run setup` decides: the `.env` it writes, which values it keeps,
 * and what it says about the ones it cannot fill in. Free of the filesystem,
 * the network and `process`.
 *
 * decisions/400-one-command-setup.md
 */
import { parseEnv } from "node:util";
import {
  COMPOSE_DATABASE_NAME,
  COMPOSE_POSTGRES_PORT,
  COMPOSE_POSTGRES_USER,
  isComposeDatabase,
} from "./services-plan";

/**
 * The value `.env.example` once shipped for `DATABASE_URL`. Counted as unset:
 * it names a user the container never had.
 *
 * decisions/400-one-command-setup.md
 */
export const LEGACY_DATABASE_URL = "postgresql://user:password@localhost:5432/footy-trends";

/**
 * Where `npm run dev` serves, which is what better-auth must be told locally.
 *
 * decisions/400-one-command-setup.md
 */
export const LOCAL_AUTH_URL = "http://localhost:3000";

/**
 * The connection string for the compose database, with this password.
 *
 * decisions/400-one-command-setup.md
 */
export function composeDatabaseUrl(password: string): string {
  const url = new URL(`postgresql://localhost:${COMPOSE_POSTGRES_PORT}/`);
  url.username = COMPOSE_POSTGRES_USER;
  // Encoded here, because the setter does not do it completely: `%` passes
  // through untouched and the result no longer decodes.
  url.password = encodeURIComponent(password);
  url.pathname = `/${COMPOSE_DATABASE_NAME}`;
  return url.toString();
}

/**
 * What an existing `DATABASE_URL` says about this project's database. Three
 * answers: another server's URL is left alone, while one naming this database
 * with a credential that cannot be decoded stops setup.
 *
 * decisions/400-one-command-setup.md
 */
export type ComposeCredential =
  | { kind: "elsewhere" }
  | { kind: "unreadable" }
  | { kind: "password"; value: string };

export function composeCredential(url: string): ComposeCredential {
  // The database name is part of the question, not just the server: another
  // project's database on `localhost:5432` is not this one.
  if (!isComposeDatabase(url)) return { kind: "elsewhere" };

  try {
    const parsed = new URL(url);
    if (decodeURIComponent(parsed.username) !== COMPOSE_POSTGRES_USER) return { kind: "elsewhere" };
    return { kind: "password", value: decodeURIComponent(parsed.password) };
  } catch {
    // `isComposeDatabase` has already parsed the URL, so only a malformed
    // percent escape in the credential lands here — `%E0%A4%A`, say.
    return { kind: "unreadable" };
  }
}

/**
 * The password this URL carries for the compose database, if it can say.
 *
 * decisions/400-one-command-setup.md
 */
export function composePasswordOf(url: string): string | null {
  const credential = composeCredential(url);
  return credential.kind === "password" ? credential.value : null;
}

/**
 * A variable name as `.env` files spell them.
 *
 * decisions/400-one-command-setup.md
 */
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/**
 * What this module will write as a value unquoted. Narrower than what an
 * `.env` parser accepts: anything outside it would read back changed.
 *
 * decisions/400-one-command-setup.md
 */
const ENV_VALUE = /^[A-Za-z0-9._~%:/@+=-]*$/;

/**
 * Whether `setEnvValue` can write this value without changing it. Asked before
 * writing wherever the value came from outside this module.
 *
 * decisions/400-one-command-setup.md
 */
export function canWriteEnvValue(value: string): boolean {
  return ENV_VALUE.test(value);
}

/**
 * `text` with `name` set to `value`: every existing assignment replaced, or one
 * appended when there is none; every other line is left as it was. Throws on
 * a value it cannot write faithfully.
 *
 * decisions/400-one-command-setup.md
 */
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
 * decisions/400-one-command-setup.md
 */
function settingOf(values: NodeJS.Dict<string>, name: string): string {
  return (values[name] ?? "").trim();
}

export type EnvPlan = {
  text: string;
  /**
   * What this run wrote, for the report: names and how each was arrived at,
   * never the value.
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
 * Nothing already set is replaced, which is what makes a second run safe.
 *
 * decisions/400-one-command-setup.md
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

  // Read once, and used by both the password choice and the disagreement check.
  const credential: ComposeCredential = urlUnset ? { kind: "elsewhere" } : composeCredential(url);

  // A broken URL for this very database. Writing a password beside it and
  // migrating anyway is the one thing that must not happen.
  if (credential.kind === "unreadable") {
    return { text: original, written: [], stop: unreadableUrlMessage() };
  }

  const choice = choosePassword({
    configured: settingOf(values, "FOOTY_POSTGRES_PASSWORD"),
    inUrl: credential.kind === "password" ? credential.value : null,
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

  return { text, written, stop: disagreement(choice.password, credential) };
}

/**
 * Which password this `.env` should carry, or why setup cannot say. `note` is
 * what the report will call it; `null` means it was already there.
 *
 * decisions/400-one-command-setup.md
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

  // A password already in `DATABASE_URL` is adopted, not replaced: the volume
  // was initialised with it.
  if (inUrl !== null && inUrl !== "") {
    // The one value here that comes from outside, and it arrives decoded, so it
    // may be one `.env` cannot carry unquoted.
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
 * password. A URL for some other server is a choice, and is not compared.
 *
 * decisions/400-one-command-setup.md
 */
function disagreement(password: string, credential: ComposeCredential): string | null {
  if (credential.kind !== "password") return null;

  return credential.value !== password ? mismatchMessage() : null;
}

/**
 * When `DATABASE_URL` names this project's database but its credential cannot
 * be decoded. Setup stops; it writes no password beside it.
 *
 * decisions/400-one-command-setup.md
 */
export function unreadableUrlMessage(): string {
  return [
    "DATABASE_URL names this project's database, but its credential cannot be read:",
    "it contains a percent escape that is not valid, such as `%E0%A4%A`.",
    "",
    "Nothing was changed. If you know the password, fix the escaping in .env — `%`",
    "itself is written `%25`. If the local database holds nothing worth keeping,",
    "`npm run db:reset:dev` destroys it, and clearing DATABASE_URL lets setup write",
    "a fresh one with a new password.",
  ].join("\n");
}

/**
 * Says which value to change and not which is right: only the developer knows
 * which one their Postgres volume was initialised with.
 *
 * decisions/400-one-command-setup.md
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
 * decisions/400-one-command-setup.md
 */
export const DATABASE_VARIABLES = ["DATABASE_URL", "FOOTY_POSTGRES_PASSWORD"] as const;

/**
 * Why an exported variable makes the `.env` just written a lie, or `null`. An
 * export beats the file everywhere setup hands off to; one that agrees with
 * the file says nothing.
 *
 * decisions/400-one-command-setup.md
 */
export function exportedOverrideMessage(
  exported: NodeJS.Dict<string>,
  envText: string
): string | null {
  const values = parseEnv(envText);

  // Present, not merely non-empty: an exported `DATABASE_URL=` counts as set.
  // Compared against the raw exported value, which is what the child will use.
  const conflicting = DATABASE_VARIABLES.filter(
    (name) => exported[name] !== undefined && exported[name] !== settingOf(values, name)
  );

  if (conflicting.length === 0) return null;

  // No `?? ""`: every name here is one `conflicting` already found defined, so a
  // fallback would be a condition nothing can take — which is what
  // `scripts/coverage-gaps.ts` reported when it was there.
  const anyEmpty = conflicting.some((name) => exported[name] === "");

  return [
    `${conflicting.join(" and ")} ${conflicting.length === 1 ? "is" : "are"} exported in this shell,`,
    "and what is exported wins over .env for everything setup runs next.",
    ...(anyEmpty
      ? [
          "An exported variable counts even when it is empty: the child process still",
          "inherits it, and .env does not replace a variable that is already set.",
        ]
      : []),
    "",
    "Migrations would use the exported value while .env carried another, so .env has",
    `been written and nothing else was run. Either \`unset ${conflicting.join(" ")}\` and`,
    "run setup again, or make the exported values match the file.",
  ].join("\n");
}

/**
 * When the password in use cannot go into `.env` as an unquoted value. Setup
 * stops; it writes no substitute.
 *
 * decisions/400-one-command-setup.md
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
 * The two values that genuinely come from outside the repository. Both
 * optional: the dev server starts without them.
 *
 * decisions/400-one-command-setup.md
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

/**
 * The API keys this `.env` leaves blank.
 *
 * decisions/400-one-command-setup.md
 */
export function missingApiKeys(text: string): ApiKey[] {
  const values = parseEnv(text);
  return API_KEYS.filter((key) => settingOf(values, key.name) === "");
}

/**
 * Characters an API key is made of: the same set a value may be written with.
 *
 * decisions/400-one-command-setup.md
 */
const KEY_INPUT = /^[A-Za-z0-9._~+/=-]+$/;

export type KeyInput = { kind: "skip" } | { kind: "key"; value: string } | { kind: "invalid" };

/**
 * One answer to a key prompt. Empty skips, because both keys are optional;
 * anything with a space, a quote or a `#` is refused.
 *
 * decisions/400-one-command-setup.md
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

/**
 * Signing in is the one thing a blank Google client breaks; every page works
 * signed out.
 *
 * decisions/400-one-command-setup.md
 */
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
 * The npm version running this, from `npm_config_user_agent`:
 * `npm/12.0.1 node/v24.16.0 darwin arm64 workspaces/false`.
 *
 * decisions/400-one-command-setup.md
 */
export function npmVersionFromUserAgent(userAgent: string): string | null {
  return /^npm\/(\d+\.\d+\.\d+)(?:\s|$)/.exec(userAgent)?.[1] ?? null;
}

/**
 * A warning when npm is not the version `packageManager` pins, or `null`. A
 * warning, not a stop.
 *
 * decisions/400-one-command-setup.md
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
 * Only a clear yes, or just Enter, starts the server: the prompt says `[Y/n]`.
 * `null` is end of input, not agreement.
 *
 * decisions/400-one-command-setup.md
 */
export function wantsDevServer(answer: string | null): boolean {
  return answer !== null && ["", "y", "yes"].includes(answer.trim().toLowerCase());
}
