/**
 * The decisions behind backing up and restoring the production database, free
 * of the network, the database and `process`, so they can be unit tested.
 *
 * decisions/807-database-backup.md
 */

/**
 * The image both `pg_dump` and `pg_restore` run from: the server's major, so
 * neither meets a format newer than it reads.
 *
 * decisions/807-database-backup.md
 */
export const POSTGRES_IMAGE = "postgres:18-alpine";

/**
 * The scratch database a restore goes into, on the local Docker server. Fixed,
 * so no argument can point the drop that precedes a restore at anything else.
 *
 * decisions/807-database-backup.md
 */
export const RESTORE_DATABASE = "footy-trends_restore_check";

export const DUMP_FILE = "database.dump.age";
export const COUNTS_FILE = "counts.json.age";

/**
 * Every table's row count, as `schema.table` and a number, in one statement, so
 * the backup and the restore count with the same text.
 *
 * decisions/807-database-backup.md
 */
export const COUNTS_SQL = `select n.nspname || '.' || c.relname as "table",
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as "rows"
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname not in ('pg_catalog', 'information_schema')
  and n.nspname not like 'pg_toast%'
order by 1`;

export type Counts = Record<string, number>;

/**
 * Rows of `COUNTS_SQL` as a record. The driver returns `bigint` as a string.
 *
 * decisions/807-database-backup.md
 */
export function countsFromRows(rows: readonly { table: string; rows: string | number }[]): Counts {
  const counts: Counts = {};
  for (const row of rows) counts[row.table] = Number(row.rows);
  return counts;
}

/**
 * `psql -At -F '\t'` output of `COUNTS_SQL` as a record. A line that is not a
 * name, a tab and a whole number is refused rather than skipped.
 *
 * decisions/807-database-backup.md
 */
export function countsFromPsql(output: string): Counts {
  const rows = output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const match = /^([^\t]+)\t(\d+)$/.exec(line);
      if (match === null) throw new Error(`Unexpected line in the row counts: ${line}`);
      return { table: match[1] as string, rows: match[2] as string };
    });
  return countsFromRows(rows);
}

/**
 * The tables whose counts differ, each as one line; empty when every table
 * matches. A table on one side only is a difference.
 *
 * decisions/807-database-backup.md
 */
export function compareCounts(expected: Counts, actual: Counts): string[] {
  const tables = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort(
    (left, right) => left.localeCompare(right)
  );
  return tables.flatMap((table) => {
    const want = expected[table];
    const got = actual[table];
    if (want === got) return [];
    return [`${table}: ${want ?? "missing"} at backup time, ${got ?? "missing"} restored`];
  });
}

/**
 * The folder one backup's files go in: its UTC time to the second, so names
 * sort by age.
 *
 * decisions/807-database-backup.md
 */
export function backupFolder(at: Date): string {
  return `${at.toISOString().slice(0, 19).replaceAll(/[-:]/g, "")}Z`;
}

/**
 * The newest folder that holds both a dump and its counts, or `null` when none
 * does.
 *
 * decisions/807-database-backup.md
 */
export function latestBackup(fileNames: readonly string[]): string | null {
  const names = new Set(fileNames);
  const folders = fileNames
    .filter((name) => name.endsWith(`/${DUMP_FILE}`))
    .map((name) => name.slice(0, -(DUMP_FILE.length + 1)))
    .filter((folder) => names.has(`${folder}/${COUNTS_FILE}`))
    .sort((left, right) => left.localeCompare(right));
  return folders.at(-1) ?? null;
}

/**
 * libpq's variables for a connection string, so the address reaches `pg_dump`
 * through the environment and never its command line. Encryption is required:
 * the server is reached over the internet.
 *
 * decisions/807-database-backup.md
 */
export function libpqEnvironment(connectionString: string): Record<string, string> {
  const url = new URL(connectionString);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port === "" ? "5432" : url.port,
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
    PGSSLMODE: "require",
  };
}

/**
 * A key file's two lines, the key's id and the key, or a reason it is not one.
 *
 * decisions/807-database-backup.md
 */
export function parseKeyFile(
  text: string
): { ok: true; keyId: string; key: string } | { ok: false; message: string } {
  const lines = text.split("\n").map((line) => line.trim());
  const [keyId = "", key = ""] = lines;
  if (keyId === "" || key === "" || lines.slice(2).some((line) => line !== "")) {
    return { ok: false, message: "A key file is two lines: the key's id, then the key." };
  }
  return { ok: true, keyId, key };
}

/**
 * The restore's command line: `--b2-key=` and `--identity=`, both files.
 *
 * decisions/807-database-backup.md
 */
export function parseRestoreArgs(
  argv: readonly string[]
): { ok: true; b2Key: string; identity: string } | { ok: false; message: string } {
  const flags = new Map<string, string>();
  for (const arg of argv) {
    const match = /^--(b2-key|identity)=(.+)$/.exec(arg);
    if (match === null) return { ok: false, message: `Unrecognised argument: ${arg}` };
    flags.set(match[1] as string, match[2] as string);
  }
  const b2Key = flags.get("b2-key");
  const identity = flags.get("identity");
  if (b2Key === undefined || identity === undefined) {
    return { ok: false, message: "Both --b2-key=<file> and --identity=<file> are required." };
  }
  return { ok: true, b2Key, identity };
}

/**
 * The counts' totals in one line, for the run's log.
 *
 * decisions/807-database-backup.md
 */
export function describeCounts(counts: Counts): string {
  const tables = Object.keys(counts).length;
  const rows = Object.values(counts).reduce((sum, value) => sum + value, 0);
  return `${tables} tables, ${rows} rows`;
}
