import { eq } from "drizzle-orm";
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

    // Read first, so the outcome can be described from what was actually there
    // rather than from what the update was asked to do. `where email = …`
    // matching nothing is the failure the hand-written SQL had, and it looked
    // exactly like success.
    const [before] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.email, request.email))
      .limit(1);

    if (before === undefined) {
      return { ok: false, message: noSuchAccount(request.email) };
    }

    if (before.role !== request.role) {
      await db
        .update(user)
        .set({ role: request.role, updatedAt: new Date() })
        .where(eq(user.email, request.email));
    }

    // Read back rather than assume. The update reports no error when it matches
    // nothing, so the only honest way to say what the role is now is to ask.
    const [after] = await db
      .select({ role: user.role })
      .from(user)
      .where(eq(user.email, request.email))
      .limit(1);

    if (after === undefined) {
      // The row disappeared between the two reads — someone deleted the account
      // while this ran. Rare, and reporting a grant would be a lie.
      return { ok: false, message: noSuchAccount(request.email) };
    }

    return { ok: true, message: describeOutcome(request.email, before.role, after.role) };
  } finally {
    // Closed explicitly: a script that leaves the connection open hangs on
    // exit, and `process.exit` in its place can truncate output that has not
    // been flushed — the reason `src/db` exports `closeDatabase` at all.
    await client.end();
  }
}
