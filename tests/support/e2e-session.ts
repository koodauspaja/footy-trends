import { createHmac, randomUUID } from "node:crypto";
import postgres from "postgres";
import { testDatabaseUrl } from "./test-database";

/**
 * A real signed-in reader for the e2e server: a user and a session stored in
 * the test database, and the session cookie signed as better-auth signs it.
 * It reaches what a page reads on the server, which intercepting the client's
 * session call cannot.
 *
 * decisions/695-ux-sweep.md
 */

/** better-auth's session cookie, as named over plain HTTP on localhost. */
export const SESSION_COOKIE = "better-auth.session_token";

/**
 * A session token as better-call signs a cookie: an HMAC-SHA-256 of the token
 * with the secret, in base64, after a dot, URL-encoded.
 *
 * decisions/695-ux-sweep.md
 */
export function signedSessionCookie(token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

/**
 * A stored reader with the given role, signed in for an hour: the cookie's
 * value, and how to remove the reader again, sessions with it.
 *
 * decisions/695-ux-sweep.md
 */
export async function storeSignedInReader(
  role: "user" | "admin"
): Promise<{ cookie: string; remove: () => Promise<void> }> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret === undefined || secret === "") {
    throw new Error("BETTER_AUTH_SECRET signs the session cookie, and it is not set.");
  }
  const id = `e2e-ux-${role}`;
  const token = randomUUID();
  const remove = () => withDatabase((sql) => sql`delete from "user" where id = ${id}`);

  await remove();
  await withDatabase(async (sql) => {
    await sql`insert into "user" (id, name, email, email_verified, role)
      values (${id}, ${`E2E ${role}`}, ${`${id}@example.com`}, true, ${role})`;
    await sql`insert into session (id, token, expires_at, user_id)
      values (${randomUUID()}, ${token}, ${new Date(Date.now() + 3_600_000)}, ${id})`;
  });
  return { cookie: signedSessionCookie(token, secret), remove };
}

async function withDatabase(run: (sql: postgres.Sql) => Promise<unknown>): Promise<void> {
  const sql = postgres(testDatabaseUrl());
  try {
    await run(sql);
  } finally {
    await sql.end();
  }
}
