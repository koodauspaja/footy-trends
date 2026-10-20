import { sql } from "drizzle-orm";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { OPPONENTS_ERROR_MESSAGE, opponentsPanel } from "@/components/opponents-section";
import { db, STATEMENT_TIMEOUT_MS } from "@/db";
import { getWorstOpponents } from "@/lib/match-service";

/**
 * The app client's statement timeout, against a real Postgres: a statement that
 * runs past it is cancelled, and a panel whose read is cancelled shows its
 * failure line instead of waiting.
 *
 * decisions/665-statement-timeout.md
 */

const clients: Array<ReturnType<typeof postgres>> = [];

// A second connection of the test's own, which holds what the app client then waits on.
function connect() {
  const client = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.end({ timeout: 1 })));
});

describe("the statement timeout", { timeout: 30_000 }, () => {
  it("cancels a statement that runs past it", async () => {
    // Connected first, so the clock times the statement and not the connection.
    await db.execute(sql`select 1`);
    const started = Date.now();

    // 57014 is Postgres's query_canceled, which a statement timeout raises.
    await expect(
      db.execute(sql`select pg_sleep(${(STATEMENT_TIMEOUT_MS + 2_000) / 1000})`)
    ).rejects.toMatchObject({ cause: { code: "57014" } });

    // The cancellation itself proves the bound was hit; this proves it was this
    // one and not a sooner failure. No upper bound: a loaded machine only adds.
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(STATEMENT_TIMEOUT_MS - 500);
  });

  it("shows a panel's failure line when its read waits on a lock past it", async () => {
    const holder = connect();
    // Both connected first, so the clock times the lock wait and not the connections.
    await Promise.all([holder`select 1`, db.execute(sql`select 1`)]);
    const started = Date.now();

    const series = await holder.begin(async (transaction) => {
      await transaction`lock table taso_matches in access exclusive mode`;
      // Read while the lock is held, so the panel's query waits on it.
      return getWorstOpponents({ kind: "taso", bucket: "domestic" }, 1, "/kotimaa");
    });

    const waited = Date.now() - started;
    expect(series).toEqual({ status: "error" });
    expect(renderToStaticMarkup(opponentsPanel(series))).toContain(OPPONENTS_ERROR_MESSAGE);
    expect(waited).toBeGreaterThanOrEqual(STATEMENT_TIMEOUT_MS - 500);
  });
});
