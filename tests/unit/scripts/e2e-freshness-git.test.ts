import { describe, expect, it } from "vitest";
import {
  defaultGitDeps,
  fingerprint,
  type GitDeps,
  type GitOutput,
} from "../../../scripts/e2e-freshness-git";
import { WATCHED_DIRECTORIES } from "../../../scripts/e2e-freshness-plan";

/**
 * The fingerprint the pre-push hook rests on: what git is asked, and what is
 * made of the answer. The spawn is injected the way `docker.ts` injects its
 * own, so which flags are passed is assertable — and those flags are the whole
 * correctness argument (`-z` for a filename with a newline in it, paths as
 * arguments rather than `--stdin-paths`).
 */

const BINARY = "/usr/bin/git";

type Answers = {
  /** Keyed by the first argument: `ls-files` or `hash-object`. */
  [command: string]: GitOutput;
};

function deps(answers: Answers, overrides: Partial<GitDeps> = {}): GitDeps & { calls: string[][] } {
  const calls: string[][] = [];

  return {
    calls,
    find: () => BINARY,
    run: (binary, args) => {
      calls.push([binary, ...args]);
      return answers[args[0] ?? ""] ?? { status: 1, stdout: "" };
    },
    lstat: () => ({ isSymbolicLink: () => false }),
    readlink: () => "",
    ...overrides,
  };
}

/** NUL-separated, as `-z` produces. */
const lsFiles = (...paths: string[]): GitOutput => ({
  status: 0,
  stdout: paths.join("\0"),
});

const hashes = (...values: string[]): GitOutput => ({
  status: 0,
  stdout: `${values.join("\n")}\n`,
});

describe("fingerprint", () => {
  it("lists hash and path for every watched file, in a fixed order", () => {
    const d = deps({
      "ls-files": lsFiles("src/b.ts", "src/a.ts"),
      "hash-object": hashes("bbb", "aaa"),
    });

    expect(fingerprint(d)).toEqual(["aaa\tsrc/a.ts", "bbb\tsrc/b.ts"]);
  });

  it("asks git for tracked and untracked files, NUL-separated, under the watched directories", () => {
    /**
     * `-z` is load-bearing: without it git *quotes* a path needing escaping, so
     * a filename containing a newline comes back as a literal that matches no
     * file and drops out of the fingerprint silently.
     */
    const d = deps({ "ls-files": lsFiles(), "hash-object": hashes() });

    fingerprint(d);

    expect(d.calls[0]).toEqual([
      BINARY,
      "ls-files",
      "-z",
      "-c",
      "-o",
      "--exclude-standard",
      "--",
      ...WATCHED_DIRECTORIES,
    ]);
  });

  it("passes paths as arguments, after `--`, rather than through stdin", () => {
    // `--stdin-paths` is newline-delimited and so cannot express a filename
    // containing one; `--` keeps a path that begins with a dash from being read
    // as a flag.
    const d = deps({
      "ls-files": lsFiles("src/-weird.ts"),
      "hash-object": hashes("h1"),
    });

    fingerprint(d);

    expect(d.calls[1]).toEqual([BINARY, "hash-object", "--", "src/-weird.ts"]);
  });

  it("keeps a filename containing a newline whole", () => {
    const d = deps({
      "ls-files": lsFiles("src/od\nd.ts"),
      "hash-object": hashes("h1"),
    });

    expect(fingerprint(d)).toEqual(["h1\tsrc/od\nd.ts"]);
  });

  it("reports nothing when git cannot be found, rather than an empty list", () => {
    /**
     * The distinction the module exists to keep: an empty fingerprint would read
     * as "nothing is there" and the hook would pass having verified nothing.
     */
    const d = deps({ "ls-files": lsFiles("src/a.ts") }, { find: () => null });

    expect(fingerprint(d)).toBeNull();
  });

  it("reports nothing when git fails", () => {
    const d = deps({ "ls-files": { status: 128, stdout: "" } });

    expect(fingerprint(d)).toBeNull();
  });

  it("reports nothing when hashing itself fails", () => {
    // Distinct from the listing failing: `ls-files` answered, and the hash step
    // is where git gave up.
    const d = deps({
      "ls-files": lsFiles("src/a.ts"),
      "hash-object": { status: 128, stdout: "" },
    });

    expect(fingerprint(d)).toBeNull();
  });

  it("reports nothing when a hash is missing for some path", () => {
    // A short read means some path could not be hashed. Fingerprinting the
    // subset would call the rest unchanged.
    const d = deps({
      "ls-files": lsFiles("src/a.ts", "src/b.ts"),
      "hash-object": hashes("only-one"),
    });

    expect(fingerprint(d)).toBeNull();
  });

  it("records a symlink by its target, without asking git to open it", () => {
    /**
     * `git hash-object` opens the file, so it fails on a dangling link — and
     * that failure would take the whole fingerprint with it, blocking every
     * push over one broken symlink.
     */
    const d = deps(
      { "ls-files": lsFiles("src/link.ts"), "hash-object": hashes() },
      {
        lstat: () => ({ isSymbolicLink: () => true }),
        readlink: () => "../elsewhere.ts",
      }
    );

    expect(fingerprint(d)).toEqual(["link:../elsewhere.ts\tsrc/link.ts"]);
    expect(d.calls.some((call) => call.includes("hash-object"))).toBe(false);
  });

  it("reports nothing when a symlink cannot be read at all", () => {
    const d = deps(
      { "ls-files": lsFiles("src/link.ts") },
      {
        lstat: () => ({ isSymbolicLink: () => true }),
        readlink: () => {
          throw new Error("EACCES");
        },
      }
    );

    expect(fingerprint(d)).toBeNull();
  });

  it("drops a file that is gone from the working tree, which is what shows a deletion", () => {
    const d = deps(
      { "ls-files": lsFiles("src/gone.ts", "src/here.ts"), "hash-object": hashes("h1") },
      {
        lstat: (path) => {
          if (path === "src/gone.ts") throw new Error("ENOENT");
          return { isSymbolicLink: () => false };
        },
      }
    );

    expect(fingerprint(d)).toEqual(["h1\tsrc/here.ts"]);
    expect(d.calls[1]).toEqual([BINARY, "hash-object", "--", "src/here.ts"]);
  });

  it("hashes in batches, so a large tree stays under the argument limit", () => {
    const paths = Array.from({ length: 501 }, (_, index) => `src/f${index}.ts`);
    let batch = 0;
    const d = deps(
      { "ls-files": lsFiles(...paths) },
      {
        run: (_binary, args) => {
          if (args[0] === "ls-files") return lsFiles(...paths);
          batch += 1;
          // Each call is answered with exactly as many hashes as it asked for.
          const asked = args.length - 2;
          return hashes(...Array.from({ length: asked }, (_, index) => `h${batch}-${index}`));
        },
      }
    );

    const result = fingerprint(d);

    expect(batch).toBe(2);
    expect(result).toHaveLength(501);
  });

  it("returns an empty list when nothing is watched — which is not the same as null", () => {
    const d = deps({ "ls-files": lsFiles(), "hash-object": hashes() });

    expect(fingerprint(d)).toEqual([]);
  });
});

describe("defaultGitDeps", () => {
  it("looks for git by absolute path rather than through PATH", () => {
    const found = defaultGitDeps.find();

    expect(found === null || found.startsWith("/") || /^[A-Z]:\\/.test(found)).toBe(true);
  });

  it("runs a command and passes its status and output through", () => {
    // A harmless command that is certainly present, the way `docker.test.ts`
    // exercises its own spawn.
    const result = defaultGitDeps.run(process.execPath, ["-e", "process.stdout.write('hi')"]);

    expect(result.status).toBe(0);
    expect(result.stdout).toBe("hi");
  });

  it("describes this very file as a file, and not as a symlink", () => {
    expect(defaultGitDeps.lstat("package.json").isSymbolicLink()).toBe(false);
  });

  it("refuses to read a link where there is none", () => {
    expect(() => defaultGitDeps.readlink("package.json")).toThrow();
  });
});
