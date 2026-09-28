import { describe, expect, it, vi } from "vitest";
import {
  bodyReader,
  checkBoxes,
  type ReadBody,
  runCheck,
  startCheck,
} from "../../../scripts/issue-boxes-steps";

/**
 * The sequence behind `npm run check:boxes` (#463), with the reading injected
 * so the whole command is exercised without a network.
 *
 * What this file owns is the part `issue-boxes-plan.test.ts` cannot see: which
 * bodies are fetched, what happens when one cannot be, and the exit code —
 * which is the only thing CI reads.
 */

const REPOSITORY = "koodauspaja/footy-trends";

/** A reader over a map of path to body, failing loudly on anything unexpected. */
function reading(bodies: Record<string, string>): ReadBody {
  return (path) => {
    const body = bodies[path];
    if (body === undefined) return Promise.reject(new Error(`nothing stubbed for ${path}`));
    return Promise.resolve(body);
  };
}

function path(number: number): string {
  return `/repos/${REPOSITORY}/issues/${number}`;
}

function consoleSpy() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    lines: { out, err },
  };
}

describe("checkBoxes", () => {
  it("passes when every box on the closed issue is ticked", async () => {
    const result = await checkBoxes({
      pull: 464,
      repository: REPOSITORY,
      read: reading({ [path(464)]: "Closes #459", [path(459)]: "- [x] one\n- [x] two" }),
    });

    expect(result.passed).toBe(true);
    expect(result.lines.join("\n")).toContain("#459");
  });

  it("fails and names the bare box", async () => {
    const result = await checkBoxes({
      pull: 464,
      repository: REPOSITORY,
      read: reading({ [path(464)]: "Closes #459", [path(459)]: "- [x] one\n- [ ] two" }),
    });

    expect(result.passed).toBe(false);
    expect(result.lines.join("\n")).toContain("- [ ] two");
  });

  it("passes when the only unticked box carries its reason", async () => {
    const result = await checkBoxes({
      pull: 464,
      repository: REPOSITORY,
      read: reading({
        [path(464)]: "Closes #459",
        [path(459)]: "- [ ] two — **not ticked: it needs a live page.**",
      }),
    });

    expect(result.passed).toBe(true);
  });

  it("passes a pull request that closes no issue, and says so", async () => {
    // A trivial chore may have neither issue nor board card, so demanding one
    // would enforce a rule this repository does not have.
    const result = await checkBoxes({
      pull: 462,
      repository: REPOSITORY,
      read: reading({ [path(462)]: "Part of #461, no closing keyword here" }),
    });

    expect(result.passed).toBe(true);
    expect(result.lines.join("\n")).toContain("No issue is closed");
  });

  it("checks every issue the pull request closes", async () => {
    const result = await checkBoxes({
      pull: 1,
      repository: REPOSITORY,
      read: reading({
        [path(1)]: "Closes #2\nCloses #3",
        [path(2)]: "- [x] fine",
        [path(3)]: "- [ ] bare",
      }),
    });

    expect(result.passed).toBe(false);
    // The second issue's failure must not be hidden by the first one passing.
    expect(result.lines.join("\n")).toContain("#3");
  });
});

describe("runCheck", () => {
  const env = { GH_TOKEN: "token" };

  it("returns 0 and prints the summary when nothing is bare", async () => {
    const spy = consoleSpy();
    const code = await runCheck(["node", "script", "464"], env, spy, () =>
      reading({ [path(464)]: "Closes #459", [path(459)]: "- [x] one" })
    );

    expect(code).toBe(0);
    expect(spy.lines.out.join("\n")).toContain("#459");
    expect(spy.lines.err).toEqual([]);
  });

  it("returns 1 and prints to stderr when a box is bare", async () => {
    const spy = consoleSpy();
    const code = await runCheck(["node", "script", "464"], env, spy, () =>
      reading({ [path(464)]: "Closes #459", [path(459)]: "- [ ] bare" })
    );

    expect(code).toBe(1);
    expect(spy.lines.err.join("\n")).toContain("- [ ] bare");
  });

  it("refuses without a pull request number", async () => {
    const spy = consoleSpy();

    expect(await runCheck(["node", "script"], env, spy, () => reading({}))).toBe(1);
    expect(spy.lines.err.join("\n")).toContain("Usage:");
  });

  it("refuses a pull request number that is not one", async () => {
    const spy = consoleSpy();

    expect(await runCheck(["node", "script", "-3"], env, spy, () => reading({}))).toBe(1);
    expect(await runCheck(["node", "script", "nonsense"], env, spy, () => reading({}))).toBe(1);
  });

  it("refuses without a token, and says how to supply one", async () => {
    const spy = consoleSpy();
    const code = await runCheck(["node", "script", "464"], {}, spy, () => reading({}));

    expect(code).toBe(1);
    expect(spy.lines.err.join("\n")).toContain("GH_TOKEN");
  });

  it("does not let an empty GH_TOKEN shadow a real GITHUB_TOKEN", async () => {
    const spy = consoleSpy();
    // Exported but empty is not a token, and `??` would have taken it.
    const code = await runCheck(
      ["node", "script", "464"],
      { GH_TOKEN: "", GITHUB_TOKEN: "ci" },
      spy,
      () => reading({ [path(464)]: "no keyword" })
    );

    expect(code).toBe(0);
    expect(spy.lines.err).toEqual([]);
  });

  it("takes GITHUB_TOKEN too, which is what CI supplies", async () => {
    const spy = consoleSpy();
    const code = await runCheck(["node", "script", "464"], { GITHUB_TOKEN: "ci" }, spy, () =>
      reading({ [path(464)]: "", [path(459)]: "" })
    );

    expect(code).toBe(0);
  });

  it("reads the repository CI names, rather than assuming this one", async () => {
    const spy = consoleSpy();
    const elsewhere = "someone/else";
    const code = await runCheck(
      ["node", "script", "7"],
      { GH_TOKEN: "t", GITHUB_REPOSITORY: elsewhere },
      spy,
      () => reading({ [`/repos/${elsewhere}/issues/7`]: "no keyword" })
    );

    expect(code).toBe(0);
  });

  it("fails rather than passes when the API cannot be read", async () => {
    const spy = consoleSpy();
    const code = await runCheck(["node", "script", "464"], env, spy, () => () => {
      return Promise.reject(new Error("GitHub answered 403 for /repos"));
    });

    // An unreachable API is the same silence as the rule being skipped, which
    // is the thing this check exists to end.
    expect(code).toBe(1);
    expect(spy.lines.err.join("\n")).toContain("403");
  });

  it("passes the token it was given to the reader", async () => {
    const spy = consoleSpy();
    const reader = vi.fn(() => reading({ [path(9)]: "no keyword" }));
    await runCheck(["node", "script", "9"], { GH_TOKEN: "secret" }, spy, reader);

    expect(reader).toHaveBeenCalledWith("secret");
  });
});

describe("bodyReader", () => {
  it("asks GitHub for the body, with the version header the API wants", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ body: "Closes #1" }), { status: 200 }));

    expect(await bodyReader("token")("/repos/x/issues/1")).toBe("Closes #1");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.github.com/repos/x/issues/1",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      })
    );
    fetchSpy.mockRestore();
  });

  it("reads a null body as empty, because a description is optional", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ body: null }), { status: 200 }));

    expect(await bodyReader("token")("/repos/x/issues/1")).toBe("");
    fetchSpy.mockRestore();
  });

  it("throws with the status, rather than reporting a pass", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));

    await expect(bodyReader("token")("/repos/x/issues/1")).rejects.toThrow("404");
    fetchSpy.mockRestore();
  });
});

describe("startCheck", () => {
  it("wires the process's own argv, environment and streams", async () => {
    const written: string[] = [];
    const errSpy = vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const argv = vi.spyOn(process, "argv", "get").mockReturnValue(["node", "script"]);

    // Under vitest `argv` is the runner's, so the real wiring is exercised by
    // the path that needs no network: no pull request number, exit code 1.
    expect(await startCheck()).toBe(1);
    expect(written.join("")).toContain("Usage:");

    argv.mockRestore();
    errSpy.mockRestore();
  });

  it("writes a passing verdict to stdout, not to stderr", async () => {
    const written: string[] = [];
    const outSpy = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    const argv = vi.spyOn(process, "argv", "get").mockReturnValue(["node", "script", "458"]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ body: "no closing keyword" }), {
        status: 200,
      })
    );
    // `delete`, not `= undefined`: Node stores the *string* "undefined" for the
    // latter, so a later test asking whether the variable is absent would see a
    // bogus token instead.
    const previous = process.env.GH_TOKEN;
    process.env.GH_TOKEN = "token";

    expect(await startCheck()).toBe(0);
    expect(written.join("")).toContain("No issue is closed");

    if (previous === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = previous;

    // Asserted, because `= undefined` leaves the string "undefined" behind and
    // nothing else in this file would notice: every other test passes its own
    // `env`, so only this one touches the real one.
    expect(process.env.GH_TOKEN).toBe(previous);
    fetchSpy.mockRestore();
    argv.mockRestore();
    outSpy.mockRestore();
  });
});
