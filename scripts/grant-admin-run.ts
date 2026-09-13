import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { user } from "../src/db/schema";
import { describeOutcome, noSuchAccount, type Request } from "./grant-admin-plan";

/**
 * The database half of `grant-admin.ts`.
 *
 * Its own pool rather than `src/db`, because that module reads
 * `process.env.DATABASE_URL` at import time and this script's whole point is
 * that the operator passes the target explicitly. Taking the connection string
 * as an argument makes the target impossible to get wrong by forgetting a
 * variable.
 */
export type RunResult = { ok: boolean; message: string };

export async function setRole(connectionString: string, request: Request): Promise<RunResult> {
  // `postgres-js`, the same driver `src/db` uses — a second driver in the
  // repository would be a second set of connection semantics to reason about.
  const client = postgres(connectionString);
  try {
    const db = drizzle(client);

    /**
     * Read, write and read back inside one transaction, with the row locked.
     *
     * Three separate statements could interleave with another writer — the app
     * itself has `/yllapito`, which changes roles — and the script would then
     * report a transition that did not happen, or miss one that did. That is
     * the failure this script exists to remove, so it would be a poor one to
     * leave in.
     *
     * The lock is on the one row, so it blocks only writes to that account.
     */
    return await db.transaction(async (tx) => {
      // `lower()` on both sides. The column holds whatever Google sent, so a
      // normalised input compared against a raw column reports an account
      // stored as `Matti@Example.fi` as nonexistent.
      const match = sql`lower(${user.email}) = ${request.email}`;

      const [before] = await tx
        .select({ role: user.role })
        .from(user)
        .where(match)
        .limit(1)
        .for("update");

      if (before === undefined) {
        return { ok: false, message: noSuchAccount(request.email) };
      }

      if (before.role !== request.role) {
        await tx.update(user).set({ role: request.role, updatedAt: new Date() }).where(match);
      }

      // Read back rather than assume. An update reports no error when it
      // matches nothing, so the only honest way to say what the role is now is
      // to ask.
      const [after] = await tx.select({ role: user.role }).from(user).where(match).limit(1);

      if (after === undefined) {
        return { ok: false, message: noSuchAccount(request.email) };
      }

      // The readback has to equal what was asked for. Finding *a* row is not
      // the same as the change having happened, and reporting a transition we
      // did not establish is the exact thing this script replaced.
      if (after.role !== request.role) {
        return {
          ok: false,
          message: `${request.email} is ${after.role}, not ${request.role}. Nothing was changed — try again.`,
        };
      }

      return { ok: true, message: describeOutcome(request.email, before.role, after.role) };
    });
  } finally {
    // Closed explicitly: a script that leaves the connection open hangs on
    // exit, and `process.exit` in its place can truncate output that has not
    // been flushed — the reason `src/db` exports `closeDatabase` at all.
    await client.end();
  }
}
