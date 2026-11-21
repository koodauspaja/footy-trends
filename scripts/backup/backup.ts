/**
 * The production database's daily backup, `npm run backup`: every table's count
 * and a dump from one snapshot, both encrypted with `age` and uploaded to B2.
 *
 * decisions/807-database-backup.md
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import postgres from "postgres";
import { executablePath } from "../shared/executable";
import { authorize, upload } from "./b2";
import {
  backupFolder,
  CONTAINER_CA_FILE,
  COUNTS_FILE,
  COUNTS_SQL,
  type Counts,
  countsFromRows,
  DUMP_FILE,
  describeCounts,
  libpqEnvironment,
  POSTGRES_IMAGE,
  RAILWAY_CA_FILE,
  SERVER_CERTIFICATE_NAME,
  uploadKeyProblem,
} from "./backup-plan";
import { capture, pipe } from "./processes";

const RECIPIENTS = path.join("scripts", "backup", "recipients.txt");

function out(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function required(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (value === "") throw new Error(`${name} is not set, or is empty.`);
  return value;
}

function tool(name: "docker" | "age"): string {
  const found = executablePath(name);
  if (found === null) throw new Error(`${name} was not found.`);
  return found;
}

async function main(): Promise<void> {
  const connectionString = required("BACKUP_DATABASE_URL");
  const docker = tool("docker");
  const age = tool("age");
  const session = await authorize(required("B2_KEY_ID"), required("B2_APPLICATION_KEY"), fetch);
  const keyProblem = uploadKeyProblem(session.capabilities);
  if (keyProblem !== null) throw new Error(keyProblem);

  const folder = backupFolder(new Date());
  const work = mkdtempSync(path.join(tmpdir(), "backup-"));
  const dumpPath = path.join(work, DUMP_FILE);
  const pgEnv = libpqEnvironment(connectionString, CONTAINER_CA_FILE);

  try {
    const sql = postgres(connectionString, {
      ssl: { ca: readFileSync(RAILWAY_CA_FILE, "utf8"), servername: SERVER_CERTIFICATE_NAME },
      max: 1,
    });
    let counts: Counts;
    try {
      counts = await sql.begin("isolation level repeatable read read only", async (tx) => {
        // Exported first, so it is the snapshot the counts below also read.
        const [exported] = await tx<
          { snapshot: string }[]
        >`select pg_export_snapshot() as snapshot`;
        const rows = await tx.unsafe<{ table: string; rows: string }[]>(COUNTS_SQL);
        await pipe(
          {
            path: docker,
            args: [
              "run",
              "--rm",
              "-v",
              `${path.resolve(RAILWAY_CA_FILE)}:${CONTAINER_CA_FILE}:ro`,
              ...Object.keys(pgEnv).flatMap((name) => ["-e", name]),
              POSTGRES_IMAGE,
              "pg_dump",
              "--format=custom",
              `--snapshot=${exported?.snapshot}`,
            ],
            env: pgEnv,
          },
          { path: age, args: ["--encrypt", "-R", RECIPIENTS, "-o", dumpPath] }
        );
        return countsFromRows(rows);
      });
    } finally {
      await sql.end({ timeout: 5 });
    }
    if (Object.keys(counts).length === 0) throw new Error("The database has no tables.");

    const encryptedCounts = await capture(
      { path: age, args: ["--encrypt", "-R", RECIPIENTS] },
      Buffer.from(JSON.stringify(counts, null, 2))
    );

    await upload(session, `${folder}/${DUMP_FILE}`, readFileSync(dumpPath), fetch);
    await upload(session, `${folder}/${COUNTS_FILE}`, encryptedCounts, fetch);

    out(`Backed up    ${describeCounts(counts)}`);
    out(
      `Uploaded     ${session.bucketName}/${folder}/${DUMP_FILE} (${statSync(dumpPath).size} bytes)`
    );
    out(`Uploaded     ${session.bucketName}/${folder}/${COUNTS_FILE}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
