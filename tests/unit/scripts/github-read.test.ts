import { describe, expect, it, vi } from "vitest";
import { conclude, jsonReader, processConsole, readAll } from "../../../scripts/github-read";

/**
 * What the checks that read GitHub share: the reader, every page of a list,
 * and a verdict turned into output and an exit code.
 *
 * decisions/463-bare-issue-boxes-fail.md
 * decisions/559-sourcery-review-kind.md
 */

function consoleSpy() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    lines: { out, err },
  };
}

describe("jsonReader", () => {
  it("asks GitHub for the path, with the token and the version header", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "ahead" }), { status: 200 }));

    expect(await jsonReader("token")("/repos/x/compare/a...b")).toEqual({ status: "ahead" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/x/compare/a...b",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      })
    );
    fetchSpy.mockRestore();
  });

  it("throws with the status, so what GitHub no longer has is not read as empty", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));

    await expect(jsonReader("token")("/repos/x/compare/a...b")).rejects.toThrow(
      "GitHub answered 404 for /repos/x/compare/a...b"
    );
    fetchSpy.mockRestore();
  });
});

describe("readAll", () => {
  const rows = (answer: unknown) => answer as number[];

  it("stops at a page that is not full", async () => {
    const read = vi.fn(async () => [1, 2, 3]);

    expect(await readAll(read, "/repos/x/pulls/1/reviews", rows)).toEqual([1, 2, 3]);
    expect(read.mock.calls).toEqual([["/repos/x/pulls/1/reviews?per_page=100&page=1"]]);
  });

  it("reads the page behind a full one, and keeps the order", async () => {
    const full = Array.from({ length: 100 }, (_, index) => index);
    const read = vi.fn(async (path: string) => (path.endsWith("page=1") ? full : [100, 101]));

    const all = await readAll(read, "/repos/x/pulls/1/reviews", rows);

    expect(all).toHaveLength(102);
    expect(all.at(-1)).toBe(101);
    expect(read).toHaveBeenLastCalledWith("/repos/x/pulls/1/reviews?per_page=100&page=2");
  });

  it("takes the rows out of an answer that wraps them", async () => {
    const read = async () => ({ check_runs: [7] });

    expect(
      await readAll(read, "/x", (answer) => (answer as { check_runs: number[] }).check_runs)
    ).toEqual([7]);
  });
});

describe("conclude", () => {
  it("writes a passing verdict to out and exits 0", async () => {
    const spy = consoleSpy();

    expect(await conclude(spy, "Could not", async () => ({ passed: true, lines: ["fine"] }))).toBe(
      0
    );
    expect(spy.lines).toEqual({ out: ["fine"], err: [] });
  });

  it("writes a failing verdict to err and exits 1", async () => {
    const spy = consoleSpy();

    expect(await conclude(spy, "Could not", async () => ({ passed: false, lines: ["bad"] }))).toBe(
      1
    );
    expect(spy.lines).toEqual({ out: [], err: ["bad"] });
  });

  it("exits 1 when the check cannot be made, and says what failed and why", async () => {
    const spy = consoleSpy();
    const check = () => Promise.reject(new Error("GitHub answered 403 for /repos/x"));

    expect(await conclude(spy, "Could not read #7", check)).toBe(1);
    expect(spy.lines.err).toEqual(["Could not read #7: GitHub answered 403 for /repos/x"]);
  });
});

describe("processConsole", () => {
  it("writes a line to each of the process's streams", () => {
    const written: string[] = [];
    const keep = (name: string) => (chunk: unknown) => {
      written.push(`${name}:${String(chunk)}`);
      return true;
    };
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation(keep("out"));
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation(keep("err"));

    const console = processConsole();
    console.out("one");
    console.err("two");

    outSpy.mockRestore();
    errSpy.mockRestore();
    expect(written).toEqual(["out:one\n", "err:two\n"]);
  });
});
