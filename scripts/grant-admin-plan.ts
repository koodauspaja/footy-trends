/**
 * The decisions behind granting and removing admin, kept free of the database
 * and of `process` so they can be unit tested directly — the same split as
 * `backfill-plan.ts` and its entry point.
 */

/** What the operator asked for. */
export type Request = {
  email: string;
  /** `admin` grants, `user` removes. */
  role: "admin" | "user";
};

export type ParseResult = { ok: true; request: Request } | { ok: false; message: string };

/**
 * An address, normalised the way the column stores it.
 *
 * Lower-cased and trimmed, because `user.email` is written by better-auth from
 * what Google returns and an operator retyping it will not match its case.
 *
 * **This normalises only one side.** The column holds whatever Google sent, so
 * the comparison in `grant-admin-run.ts` lower-cases the column too — matching
 * a normalised input against a raw column would report an account stored as
 * `Matti@Example.fi` as nonexistent, which review caught.
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Whether this could be an address at all.
 *
 * Deliberately shallow: one `@`, something either side, no spaces. The database
 * is the real check — an address that passes this and matches no row is
 * reported as "no account", which is the same outcome and a better message. The
 * point of validating here is to catch the operator who passed a flag value by
 * mistake, so `--email=--role=admin` fails saying so rather than reporting that
 * nobody has that address.
 */
export function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  return at > 0 && at === value.lastIndexOf("@") && at < value.length - 1;
}

/**
 * The command line, read into a request or a reason it cannot be.
 *
 * `--email=` and `--role=` rather than positional arguments: this writes to
 * production, and two bare strings in the wrong order is a mistake the shape of
 * the command should not permit. `--role` defaults to `admin` because granting
 * is the common case and the one the setup document is about.
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match === null) return { ok: false, message: `Unrecognised argument: ${arg}` };
    const key = match[1] as string;
    // A repeated flag is refused rather than letting the last one win. This
    // writes to production, and `--email=right@… --email=typo@…` silently
    // acting on the second is exactly the class of mistake the script exists
    // to remove — a wrapper script or an edited shell-history line is how it
    // happens.
    if (flags.has(key)) return { ok: false, message: `--${key} was given more than once.` };
    flags.set(key, match[2] as string);
  }

  const rawEmail = flags.get("email");
  if (rawEmail === undefined || rawEmail.trim() === "") {
    return { ok: false, message: "--email is required." };
  }

  const email = normaliseEmail(rawEmail);
  if (!looksLikeEmail(email)) {
    return { ok: false, message: `That does not look like an address: ${rawEmail}` };
  }

  // Lower-cased like the address, and for the same reason: an operator typing
  // `--role=ADMIN` means the role, and refusing it teaches nothing. The message
  // below still quotes what they actually typed.
  const rawRole = flags.get("role") ?? "admin";
  const role = rawRole.trim().toLowerCase();
  if (role !== "admin" && role !== "user") {
    return { ok: false, message: `--role must be admin or user, not: ${rawRole}` };
  }

  for (const key of flags.keys()) {
    if (key !== "email" && key !== "role") {
      return { ok: false, message: `Unrecognised argument: --${key}` };
    }
  }

  return { ok: true, request: { email, role } };
}

/**
 * What to print once the row has been read back.
 *
 * The outcome is always described from the role *before* and the role *after*,
 * both read from the database, so the script never reports a change it did not
 * confirm — the failure the hand-written SQL had, where `where email = …`
 * matching nothing looked exactly like success.
 */
export function describeOutcome(email: string, before: string, after: string): string {
  if (before === after) return `${email} was already ${after} — nothing changed.`;
  return `${email}: ${before} → ${after}`;
}

/** The message for an address nobody holds. */
export function noSuchAccount(email: string): string {
  return `No account with the address ${email}. They must sign in once before a role can be set.`;
}

/**
 * The message for an address that more than one account holds.
 *
 * Possible because `user.email` is `unique` on the raw text, which is
 * case-sensitive, while this script matches on `lower(email)` so that an
 * operator's typing finds a row stored as Google sent it. Both
 * `Matti@Example.fi` and `matti@example.fi` can therefore exist — verified
 * against Postgres, not assumed.
 *
 * Refusing is the only safe answer. Acting on the first would be a coin toss,
 * and acting on all of them would change accounts the operator never named.
 */
export function ambiguousAccount(email: string, found: readonly string[]): string {
  return [
    `More than one account matches ${email}, differing only in case:`,
    ...found.map((one) => `  ${one}`),
    "Nothing was changed. Resolve the duplicate before setting a role.",
  ].join("\n");
}
