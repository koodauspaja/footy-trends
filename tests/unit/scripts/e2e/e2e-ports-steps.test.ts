import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Deps,
  defaultDeps,
  runPortsCheck,
  startPortsCheck,
} from "../../../../scripts/e2e/e2e-ports-steps";

/**
 * `pretest:e2e`'s port check as it runs: which ports it asks lsof about, the
 * exit code that stops e2e, the skip without lsof, and the real commands.
 *
 * decisions/849-e2e-names-port-holders.md
 */

const { executablePath, real } = vi.hoisted(() => ({
  executablePath: vi.fn(),
  real: { executablePath: (() => null) as (tool: string) => string | null },
}));

vi.mock("../../../../scripts/shared/executable", async (original) => {
  const actual = await original<typeof import("../../../../scripts/shared/executable")>();
  real.executablePath = actual.executablePath as (tool: string) => string | null;
  executablePath.mockImplementation(real.executablePath);
  return { ...actual, executablePath };
});

afterEach(() => {
  vi.restoreAllMocks();
  executablePath.mockReset();
  executablePath.mockImplementation(real.executablePath);
});

const HERE = "/work/footy-trends-wt-849";

function consoleSpy() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out: (line: string) => out.push(line),
    err: (line: string) => err.push(line),
    outLines: out,
    errLines: err,
  };
}

// lsof answering `listening` per port, every holder's directory `HERE`.
function deps(
  listening: Record<number, string> = {},
  cwd: string | null = `p1\nfcwd\nn${HERE}\n`
): Deps & { asked: number[] } {
  const asked: number[] = [];
  return {
    asked,
    lsof: (args) => {
      const port = args.find((arg) => arg.startsWith("-iTCP:"));
      if (port === undefined) return cwd;
      asked.push(Number(port.slice("-iTCP:".length)));
      return listening[Number(port.slice("-iTCP:".length))] ?? "";
    },
    checkoutOf: (directory) => (directory === HERE ? HERE : null),
  };
}

describe("runPortsCheck", () => {
  it("passes free ports, asking only about the app's when the stand-in is off", () => {
    const checkout = deps();

    expect(runPortsCheck({}, HERE, checkout, consoleSpy())).toBe(0);
    expect(checkout.asked).toEqual([3001]);
  });

  it("asks about the stand-in's ports too when it is on, as the environment sets them", () => {
    const checkout = deps();

    runPortsCheck(
      { E2E_TASO_STUB: "1", E2E_PORT: "3011", E2E_TASO_PORT: "3012", E2E_REDIS_PORT: "6390" },
      HERE,
      checkout,
      consoleSpy()
    );

    expect(checkout.asked).toEqual([3011, 3012, 6390]);
  });

  it("refuses when a port is held, naming the holder", () => {
    const console = consoleSpy();

    const code = runPortsCheck(
      { E2E_TASO_STUB: "1" },
      HERE,
      deps({ 3002: "p35036\ncnode\nf20\n" }),
      console
    );

    expect(code).toBe(1);
    expect(console.errLines.join("\n")).toContain("  3002  pid 35036  node  this checkout");
  });

  it("names a holder whose directory lsof cannot give as in no checkout", () => {
    const console = consoleSpy();

    runPortsCheck({}, HERE, deps({ 3001: "p7\ncnode\n" }, null), console);

    expect(console.errLines.join("\n")).toContain("  3001  pid 7  node  no checkout");
  });

  it("skips, and says so, when lsof is not installed", () => {
    const console = consoleSpy();
    const missing: Deps = { lsof: () => null, checkoutOf: () => HERE };

    expect(runPortsCheck({}, HERE, missing, console)).toBe(0);
    expect(console.outLines).toEqual(["e2e port check skipped: lsof is not installed."]);
  });
});

describe("defaultDeps", () => {
  it("gives lsof's output, empty when it finds nothing, and null without lsof", () => {
    executablePath.mockReturnValueOnce("/bin/echo");
    expect(defaultDeps.lsof(["p1"])).toBe("p1\n");

    executablePath.mockReturnValueOnce("/usr/bin/false");
    expect(defaultDeps.lsof(["-iTCP:1"])).toBe("");

    executablePath.mockReturnValueOnce(null);
    expect(defaultDeps.lsof([])).toBeNull();
  });

  it("finds the checkout a directory is in, and null outside one or without git", () => {
    expect(defaultDeps.checkoutOf(join(process.cwd(), "scripts"))).toBe(process.cwd());
    expect(defaultDeps.checkoutOf(mkdtempSync(join(tmpdir(), "ports-")))).toBeNull();

    executablePath.mockReturnValueOnce(null);
    expect(defaultDeps.checkoutOf(process.cwd())).toBeNull();
  });
});

describe("startPortsCheck", () => {
  it("reads the env file when there is one, and runs the check", async () => {
    executablePath.mockReturnValue(null);
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const envFile = join(mkdtempSync(join(tmpdir(), "ports-")), ".env");
    writeFileSync(envFile, "E2E_PORTS_CHECK_PROBE=read\n");

    expect(await startPortsCheck(envFile)).toBe(0);
    expect(process.env.E2E_PORTS_CHECK_PROBE).toBe("read");
    expect(await startPortsCheck(`${envFile}.gone`)).toBe(0);
    delete process.env.E2E_PORTS_CHECK_PROBE;
  });
});
