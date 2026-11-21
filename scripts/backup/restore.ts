/**
 * Restores the newest backup into a scratch database on the local Docker
 * Postgres and compares every table's row count with the counts taken at backup
 * time: `npm run backup:restore -- --b2-key=<file> --identity=<file>`. The key
 * file holds a B2 key that can list and read the bucket; the identity is an
 * `age` private key one of the backup's recipients holds.
 *
 * decisions/807-database-backup.md
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { executablePath } from "../shared/executable";
import { authorize, download, listFileNames } from "./b2";
import {
  COUNTS_FILE,
  COUNTS_SQL,
  type Counts,
  compareCounts,
  countsFromPsql,
  DUMP_FILE,
  describeCounts,
  latestBackup,
  POSTGRES_IMAGE,
  parseKeyFile,
  parseRestoreArgs,
  RESTORE_DATABASE,
} from "./backup-plan";
import { capture, pipe } from "./processes";

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function tool(name: "docker" | "age"): string {
  const found = executablePath(name);
  if (found === null) throw new Error(`${name} was not found.`);
  return found;
}

async function main(): Promise<number> {
  const args = parseRestoreArgs(process.argv.slice(2));
  if (!args.ok) throw new Error(args.message);
  if (!existsSync(args.identity)) throw new Error(`No identity file at ${args.identity}.`);
  const key = parseKeyFile(readFileSync(args.b2Key, "utf8"));
  if (!key.ok) throw new Error(key.message);
  const docker = tool("docker");
  const age = tool("age");

  const session = await authorize(key.keyId, key.key, fetch);
  const folder = latestBackup(await listFileNames(session, fetch));
  if (folder === null) throw new Error(`No complete backup in ${session.bucketName}.`);
  out(`Restoring    ${session.bucketName}/${folder}`);

  const work = mkdtempSync(path.join(tmpdir(), "restore-"));
  try {
    const dumpPath = path.join(work, DUMP_FILE);
    writeFileSync(dumpPath, await download(session, `${folder}/${DUMP_FILE}`, fetch));
    const expected = JSON.parse(
      String(
        await capture(
          { path: age, args: ["--decrypt", "-i", args.identity] },
          await download(session, `${folder}/${COUNTS_FILE}`, fetch)
        )
      )
    ) as Counts;

    // The local server is whichever container of the image publishes the
    // Compose port, from this checkout or a worktree. Its own client tools do
    // the work, as its superuser, so no password is needed.
    const container = String(
      await capture({
        path: docker,
        args: [
          "ps",
          "--filter",
          "publish=5432",
          "--filter",
          `ancestor=${POSTGRES_IMAGE}`,
          "--format",
          "{{.Names}}",
        ],
      })
    )
      .split("\n")[0]
      ?.trim();
    if (!container) throw new Error(`No local ${POSTGRES_IMAGE} container publishes port 5432.`);
    const inPostgres = (...command: string[]) => ({
      path: docker,
      args: ["exec", "-i", container, ...command],
    });
    await capture(inPostgres("dropdb", "-U", "postgres", "--if-exists", RESTORE_DATABASE));
    await capture(inPostgres("createdb", "-U", "postgres", RESTORE_DATABASE));
    // Without owners and grants: the production roles do not exist here.
    await pipe(
      { path: age, args: ["--decrypt", "-i", args.identity, dumpPath] },
      inPostgres(
        "pg_restore",
        "-U",
        "postgres",
        "-d",
        RESTORE_DATABASE,
        "--no-owner",
        "--no-privileges",
        "--exit-on-error"
      )
    );
    const actual = countsFromPsql(
      String(
        await capture(
          inPostgres(
            "psql",
            "-U",
            "postgres",
            "-d",
            RESTORE_DATABASE,
            "-At",
            "-F",
            "\t",
            "-c",
            COUNTS_SQL
          )
        )
      )
    );

    out(`At backup    ${describeCounts(expected)}`);
    out(`Restored     ${describeCounts(actual)}`);
    const differences = compareCounts(expected, actual);
    for (const line of differences) out(`Differs      ${line}`);
    if (differences.length > 0) return 1;
    out(`Every table matches. The restored copy is in ${RESTORE_DATABASE}.`);
    return 0;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
);
