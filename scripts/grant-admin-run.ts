import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { user } from "../src/db/schema";
import { ambiguousAccount, describeOutcome, noSuchAccount, type Request } from "./grant-admin-plan";

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
      /**
       * Every row whose address matches once case is ignored, locked together.
       *
       * `lower()` on both sides, because the column holds whatever Google sent
       * and a normalised input compared against a raw column reports an account
       * stored as `Matti@Example.FI` as nonexistent.
       *
       * But the unique index is on the **raw** text and so is case-sensitive,
       * which means this predicate can match more than one account. Selecting
       * them all and locking them all is what makes the count below trustworthy
       * — an earlier version took `.limit(1).for("update")`, locked one row, and
       * then updated every match, so a single command could change two accounts
       * and report one.
       */
      const matches = await tx
        .select({ id: user.id, email: user.email, role: user.role })
        .from(user)
        .where(sql`lower(${user.email}) = ${request.email}`)
        .for("update");

      if (matches.length === 0) {
        return { ok: false, message: noSuchAccount(request.email) };
      }
      if (matches.length > 1) {
        // Refusing rather than choosing: acting on the first is a coin toss,
        // and acting on all changes accounts the operator never named.
        return {
          ok: false,
          message: ambiguousAccount(
            request.email,
            matches.map((row) => row.email)
          ),
        };
      }

      // Exactly one, and from here everything addresses it by id — a predicate
      // that can match more than one row has no business in a write.
      const target = matches[0] as { id: string; email: string; role: string };

      if (target.role !== request.role) {
        await tx
          .update(user)
          .set({ role: request.role, updatedAt: new Date() })
          .where(eq(user.id, target.id));
      }

      // Read back rather than assume. An update reports no error when it
      // matches nothing, so the only honest way to say what the role is now is
      // to ask.
      const [after] = await tx
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, target.id))
        .limit(1);

      if (after === undefined) {
        return { ok: false, message: noSuchAccount(request.email) };
      }

      // The readback has to equal what was asked for. Finding *a* row is not
      // the same as the change having happened, and reporting a transition we
      // did not establish is the exact thing this script replaced.
      if (after.role !== request.role) {
        return {
          ok: false,
          message: `${target.email} is ${after.role}, not ${request.role}. Nothing was changed — try again.`,
        };
      }

      return { ok: true, message: describeOutcome(target.email, target.role, after.role) };
    });
  } finally {
    // Closed explicitly: a script that leaves the connection open hangs on
    // exit, and `process.exit` in its place can truncate output that has not
    // been flushed — the reason `src/db` exports `closeDatabase` at all.
    await client.end();
  }
}
