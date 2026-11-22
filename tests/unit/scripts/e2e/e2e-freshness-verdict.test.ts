import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkoutFreshness,
  type FreshnessDeps,
  freshnessDeps,
  freshnessOfCheckout,
} from "../../../../scripts/e2e/e2e-freshness-verdict";

/**
 * Whether a passing e2e run vouches for a checkout, as the pre-push hook and
 * the Claude Code hook both ask it: documentation-only changes, the marker,
 * the working tree, and whether e2e can run here at all.
 *
 * decisions/837-e2e-before-a-pull-request-and-a-review.md
 */

const { fingerprint, changedFromMain, gitDepsIn, executablePath, real } = vi.hoisted(() => ({
  fingerprint: vi.fn(),
  changedFromMain: vi.fn(),
  gitDepsIn: vi.fn((directory: string) => ({ directory })),
  executablePath: vi.fn(),
  real: { executablePath: (() => null) as (tool: string) => string | null },
}));

vi.mock("../../../../scripts/e2e/e2e-freshness-git", () => ({
  fingerprint,
  changedFromMain,
  gitDepsIn,
}));

vi.mock("../../../../scripts/shared/executable", async (original) => {
  const actual = await original<typeof import("../../../../scripts/shared/executable")>();
  real.executablePath = actual.executablePath as (tool: string) => string | null;
  executablePath.mockImplementation(real.executablePath);
  return { ...actual, executablePath };
});

afterEach(() => {
  fingerprint.mockReset();
  changedFromMain.mockReset();
  executablePath.mockReset();
  executablePath.mockImplementation(real.executablePath);
});

const TOP = "/repo";
const NOW = new Date("2026-11-22T12:00:00Z");
const KEYS = "FOOTBALL_DATA_API_KEY=k\nTASO_API_KEY=k\nE2E_TASO_STUB=1\n";
const FILES = ["h1\tsrc/a.ts"];

function marker(finishedAt = "2026-11-22T11:00:00Z"): string {
  return JSON.stringify({ finishedAt, files: FILES });
}

// A checkout whose `.e2e-freshness` and `.env` are `files[...]`, Docker running.
function deps(files: Record<string, string> = {}, overrides: Partial<FreshnessDeps> = {}) {
  const read: string[] = [];
  const checkout: FreshnessDeps = {
    readText: (path) => {
      read.push(path);
      return files[path] ?? null;
    },
    git: gitDepsIn(TOP) as never,
    dockerRunning: () => true,
    now: () => NOW,
    env: {},
    ...overrides,
  };
  return { checkout, read };
}

describe("checkoutFreshness", () => {
  it("passes documentation-only changes without reading anything", () => {
    const { checkout, read } = deps();

    const { verdict, reason } = checkoutFreshness(TOP, ["docs/a.md"], checkout);

    expect(verdict.kind).toBe("pass");
    expect(verdict.message).toContain("e2e freshness check skipped");
    expect(reason).toBeNull();
    expect(read).toEqual([]);
  });

  it("blocks with the reason when no run has been recorded", () => {
    const { checkout } = deps({ "/repo/.env": KEYS });

    const { verdict, reason } = checkoutFreshness(TOP, ["src/a.ts"], checkout);

    expect(verdict.kind).toBe("block");
    expect(reason).toContain("No passing full e2e run has been recorded");
  });

  it("passes when a recent run vouches for an unchanged working tree", () => {
    fingerprint.mockReturnValue(FILES);
    const { checkout } = deps({ "/repo/.env": KEYS, "/repo/.e2e-freshness": marker() });

    const { verdict, reason } = checkoutFreshness(TOP, null, checkout);

    expect(verdict).toEqual({ kind: "pass", message: "e2e is fresh (last run 1 h 0 min ago)." });
    expect(reason).toBeNull();
    expect(fingerprint).toHaveBeenCalledWith({ directory: TOP });
  });

  it("blocks naming what changed since the run, and when git cannot read the tree", () => {
    const { checkout } = deps({ "/repo/.env": KEYS, "/repo/.e2e-freshness": marker() });

    fingerprint.mockReturnValueOnce(["h2\tsrc/a.ts"]);
    expect(checkoutFreshness(TOP, null, checkout).reason).toContain("src/a.ts (modified)");

    fingerprint.mockReturnValueOnce(null);
    expect(checkoutFreshness(TOP, null, checkout).reason).toContain(
      "<git could not read the working tree>"
    );
  });

  it("only warns when e2e cannot run here", () => {
    const { checkout } = deps({ "/repo/.env": KEYS }, { dockerRunning: () => false });

    expect(checkoutFreshness(TOP, null, checkout)).toEqual({
      verdict: expect.objectContaining({ kind: "warn" }),
      reason: null,
    });
  });

  it("reads the keys from .env, and lets the process's own environment win", () => {
    const { checkout } = deps(
      { "/repo/.env": "FOOTBALL_DATA_API_KEY=k\nTASO_API_KEY=k\nTASO_HASH_SALT=s\n" },
      { env: { TASO_API_KEY: "" } }
    );

    expect(checkoutFreshness(TOP, null, checkout).verdict.message).toContain(
      "TASO_API_KEY is not set"
    );
  });
});

describe("freshnessOfCheckout", () => {
  it("judges the checkout a directory is in by what HEAD changes from origin/main", () => {
    changedFromMain.mockReturnValue(["docs/a.md"]);

    const { verdict } = freshnessOfCheckout(join(process.cwd(), "scripts"));

    expect(verdict.kind).toBe("pass");
    expect(changedFromMain).toHaveBeenCalledWith(["HEAD"], { directory: process.cwd() });
  });

  it("blocks outside a checkout, and where git cannot be found", () => {
    expect(freshnessOfCheckout(mkdtempSync(join(tmpdir(), "fresh-"))).reason).toContain(
      "is not in a git checkout"
    );

    executablePath.mockReturnValue(null);
    expect(freshnessOfCheckout(process.cwd()).verdict.kind).toBe("block");
  });
});

describe("freshnessDeps", () => {
  it("reads files, answering null for one that is not there, with git in the checkout", () => {
    const path = join(mkdtempSync(join(tmpdir(), "fresh-")), "marker");
    writeFileSync(path, "{}");
    const real = freshnessDeps(TOP);

    expect(real.readText(path)).toBe("{}");
    expect(real.readText(`${path}.gone`)).toBeNull();
    expect(real.git).toEqual({ directory: TOP });
    expect(real.now()).toBeInstanceOf(Date);
    expect(real.env).toBe(process.env);
    expect(typeof real.dockerRunning).toBe("function");
  });
});
