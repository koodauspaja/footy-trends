import { describe, expect, it } from "vitest";
import {
  backupFolder,
  compareCounts,
  countsFromPsql,
  countsFromRows,
  describeCounts,
  latestBackup,
  libpqEnvironment,
  parseKeyFile,
  parseRestoreArgs,
  uploadKeyProblem,
} from "../../../../scripts/backup/backup-plan";

/**
 * The backup's and the restore's decisions: counting, naming, choosing the
 * newest backup, and reading what the operator hands in.
 *
 * decisions/807-database-backup.md
 */

describe("countsFromRows", () => {
  it("reads the driver's bigint strings as numbers", () => {
    expect(
      countsFromRows([
        { table: "public.user", rows: "3" },
        { table: "drizzle.__drizzle_migrations", rows: 30 },
      ])
    ).toEqual({ "public.user": 3, "drizzle.__drizzle_migrations": 30 });
  });
});

describe("countsFromPsql", () => {
  it("reads one table per line, a tab between name and count", () => {
    expect(countsFromPsql("public.matches\t14001\npublic.user\t0\n")).toEqual({
      "public.matches": 14001,
      "public.user": 0,
    });
  });

  it("refuses a line that is not a name, a tab and a whole number", () => {
    expect(() => countsFromPsql("public.matches 14001\n")).toThrow(
      "Unexpected line in the row counts: public.matches 14001"
    );
  });
});

describe("compareCounts", () => {
  it("finds nothing when every table matches", () => {
    expect(compareCounts({ "public.a": 1 }, { "public.a": 1 })).toEqual([]);
  });

  it("names a table whose count differs", () => {
    expect(compareCounts({ "public.a": 2 }, { "public.a": 1 })).toEqual([
      "public.a: 2 at backup time, 1 restored",
    ]);
  });

  it("names a table on one side only, sorted by name", () => {
    expect(compareCounts({ "public.b": 1 }, { "public.a": 0 })).toEqual([
      "public.a: missing at backup time, 0 restored",
      "public.b: 1 at backup time, missing restored",
    ]);
  });
});

describe("backupFolder", () => {
  it("is the UTC time to the second", () => {
    expect(backupFolder(new Date("2026-11-21T14:28:46.512Z"))).toBe("20261121T142846Z");
  });
});

describe("latestBackup", () => {
  it("chooses the newest folder", () => {
    expect(
      latestBackup([
        "20261120T021700Z/counts.json.age",
        "20261120T021700Z/database.dump.age",
        "20261121T021700Z/counts.json.age",
        "20261121T021700Z/database.dump.age",
      ])
    ).toBe("20261121T021700Z");
  });

  it("skips a folder whose counts are missing", () => {
    expect(
      latestBackup([
        "20261120T021700Z/counts.json.age",
        "20261120T021700Z/database.dump.age",
        "20261121T021700Z/database.dump.age",
      ])
    ).toBe("20261120T021700Z");
  });

  it("answers null for a bucket with no complete backup", () => {
    expect(latestBackup(["20261121T021700Z/counts.json.age"])).toBeNull();
  });
});

describe("libpqEnvironment", () => {
  it("splits the address into libpq's variables and requires encryption", () => {
    expect(
      libpqEnvironment("postgresql://backup_reader:p%40ss@altaria.example.com:45459/railway")
    ).toEqual({
      PGHOST: "altaria.example.com",
      PGPORT: "45459",
      PGUSER: "backup_reader",
      PGPASSWORD: "p@ss",
      PGDATABASE: "railway",
      PGSSLMODE: "require",
    });
  });

  it("uses Postgres's port when the address names none", () => {
    expect(libpqEnvironment("postgresql://u:p@db.example.com/x").PGPORT).toBe("5432");
  });
});

describe("parseKeyFile", () => {
  it("reads the key's id and the key, ignoring a trailing newline", () => {
    expect(parseKeyFile("0037abc\nK005secret\n")).toEqual({
      ok: true,
      keyId: "0037abc",
      key: "K005secret",
    });
  });

  it.each([
    ["nothing in it", ""],
    ["one line", "0037abc\n"],
    ["a third line", "0037abc\nK005secret\nextra\n"],
  ])("refuses a file with %s", (_case, text) => {
    expect(parseKeyFile(text)).toEqual({
      ok: false,
      message: "A key file is two lines: the key's id, then the key.",
    });
  });
});

describe("parseRestoreArgs", () => {
  it("reads both files", () => {
    expect(parseRestoreArgs(["--b2-key=/k", "--identity=/i"])).toEqual({
      ok: true,
      b2Key: "/k",
      identity: "/i",
    });
  });

  it("refuses an argument it does not know", () => {
    expect(parseRestoreArgs(["--target=prod"])).toEqual({
      ok: false,
      message: "Unrecognised argument: --target=prod",
    });
  });

  it("requires both files", () => {
    expect(parseRestoreArgs(["--b2-key=/k"])).toEqual({
      ok: false,
      message: "Both --b2-key=<file> and --identity=<file> are required.",
    });
  });
});

describe("uploadKeyProblem", () => {
  it("accepts a key that can only upload", () => {
    expect(uploadKeyProblem(["writeFiles"])).toBeNull();
  });

  it.each([
    ["can also delete", ["writeFiles", "deleteFiles"]],
    ["cannot upload", ["readFiles"]],
  ])("refuses a key that %s, naming what it has", (_case, capabilities) => {
    expect(uploadKeyProblem(capabilities)).toBe(
      `The B2 key may only upload (writeFiles), but it has: ${capabilities.join(", ")}.`
    );
  });
});

describe("describeCounts", () => {
  it("totals the tables and the rows", () => {
    expect(describeCounts({ "public.a": 2, "public.b": 3 })).toBe("2 tables, 5 rows");
  });
});
