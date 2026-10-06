/**
 * The decisions behind granting and removing admin, free of the database and
 * of `process` so they can be unit tested directly.
 *
 * decisions/371-grant-admin-script.md
 */

/**
 * What the operator asked for.
 *
 * decisions/371-grant-admin-script.md
 */
export type Request = {
  email: string;
  /** `admin` grants, `user` removes. */
  role: "admin" | "user";
};

export type ParseResult = { ok: true; request: Request } | { ok: false; message: string };

/**
 * An address, lower-cased and trimmed. This normalises only the input: the
 * comparison in `grant-admin-run.ts` lower-cases the column too.
 *
 * decisions/371-grant-admin-script.md
 */
export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Whether this could be an address at all: one `@`, something either side, no
 * spaces. The database is the real check.
 *
 * decisions/371-grant-admin-script.md
 */
export function looksLikeEmail(value: string): boolean {
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  return at > 0 && at === value.lastIndexOf("@") && at < value.length - 1;
}

/**
 * The command line, read into a request or a reason it cannot be. `--email=`
 * and `--role=`, never positional; `--role` defaults to `admin`.
 *
 * decisions/371-grant-admin-script.md
 */
export function parseArgs(argv: readonly string[]): ParseResult {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match === null) return { ok: false, message: `Unrecognised argument: ${arg}` };
    const key = match[1] as string;
    // A repeated flag is refused; the last one does not win.
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
 * What to print once the row has been read back: described from the role
 * before and the role after, both read from the database.
 *
 * decisions/371-grant-admin-script.md
 */
export function describeOutcome(email: string, before: string, after: string): string {
  if (before === after) return `${email} was already ${after} — nothing changed.`;
  return `${email}: ${before} → ${after}`;
}

/**
 * The message for an address nobody holds.
 *
 * decisions/371-grant-admin-script.md
 */
export function noSuchAccount(email: string): string {
  return `No account with the address ${email}. They must sign in once before a role can be set.`;
}

/**
 * The message for an address that more than one account holds. The script
 * refuses to act on any of them.
 *
 * decisions/371-grant-admin-script.md
 */
export function ambiguousAccount(email: string, found: readonly string[]): string {
  return [
    `More than one account matches ${email}, differing only in case:`,
    ...found.map((one) => `  ${one}`),
    "Nothing was changed. Resolve the duplicate before setting a role.",
  ].join("\n");
}
