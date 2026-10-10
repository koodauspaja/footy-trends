import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { user } from "../src/db/schema";
import { ambiguousAccount, describeOutcome, noSuchAccount, type Request } from "./grant-admin-plan";

/**
 * The database half of `grant-admin.ts`. Its own pool, not `src/db`: the
 * connection string is an argument, never read from the environment.
 *
 * decisions/371-grant-admin-script.md
 */
export type RunResult = { ok: boolean; message: string };

export async function setRole(connectionString: string, request: Request): Promise<RunResult> {
  // `postgres-js`, the same driver `src/db` uses — a second driver in the
  // repository would be a second set of connection semantics to reason about.
  const client = postgres(connectionString);
  try {
    const db = drizzle(client);

    // Read, decide, write and read back inside one transaction, with every
    // matching row locked. Serializable, because the count of matches is a
    // predicate that a row lock cannot hold still.
    return await db.transaction(
      async (tx) => {
        // Every row whose address matches once case is ignored, locked together:
        // `lower()` on both sides can match more than one account.
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
      },
      { isolationLevel: "serializable" }
    );
  } finally {
    // Closed explicitly: a script that leaves the connection open hangs on
    // exit, and `process.exit` in its place can truncate output that has not
    // been flushed — the reason `src/db` exports `closeDatabase` at all.
    await client.end();
  }
}
