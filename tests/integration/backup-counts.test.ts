import postgres from "postgres";
import { afterEach, describe, expect, it } from "vitest";
import { COUNTS_SQL, countsFromRows } from "../../scripts/backup/backup-plan";

/**
 * The backup's row counts against a real Postgres: every table of the schema,
 * and none of another session's temporary tables, which no other session can
 * read.
 *
 * decisions/807-database-backup.md
 */

const clients: Array<ReturnType<typeof postgres>> = [];

function connect() {
  const client = postgres(process.env.DATABASE_URL ?? "", { max: 1 });
  clients.push(client);
  return client;
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.end({ timeout: 1 })));
});

describe("the backup's row counts", () => {
  it("count the schema's tables and leave out another session's temporary table", async () => {
    const other = connect();
    await other`create temporary table backup_counts_probe (x int)`;
    await other`insert into backup_counts_probe values (1)`;

    const rows = await connect().unsafe<{ table: string; rows: string }[]>(COUNTS_SQL);
    const counts = countsFromRows(rows);

    expect(counts).toHaveProperty("public.user");
    expect(counts).toHaveProperty(["drizzle.__drizzle_migrations"]);
    expect(Object.keys(counts).filter((table) => table.endsWith(".backup_counts_probe"))).toEqual(
      []
    );
  });
});
