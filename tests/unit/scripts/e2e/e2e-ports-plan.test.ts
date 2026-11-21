import { describe, expect, it } from "vitest";
import {
  listeners,
  type PortHolder,
  portsInUse,
  portsRefusal,
  workingDirectory,
} from "../../../../scripts/e2e/e2e-ports-plan";

/**
 * Which ports e2e checks, how lsof's output is read, and what the refusal says
 * for this checkout's leftovers, another checkout's run, and both.
 *
 * decisions/849-e2e-names-port-holders.md
 */

const HERE = "/work/footy-trends-wt-849";
const THERE = "/work/footy-trends-wt-839";

function holder(port: number, pid: number, checkout: string | null): PortHolder {
  return { port, pid, command: `cmd${pid}`, checkout };
}

describe("portsInUse", () => {
  it("checks the app's port always, and the stand-in's two only when it is on", () => {
    const ports = { app: 3001, taso: 3002, redis: 6380 };

    expect(portsInUse(ports, true)).toEqual([3001, 3002, 6380]);
    expect(portsInUse(ports, false)).toEqual([3001]);
  });
});

describe("listeners", () => {
  it("reads each process id with the command after it, and skips the file lines", () => {
    expect(listeners("p35147\ncnext-server\nf14\np35036\ncnode\nf20\nf21\n")).toEqual([
      { pid: 35147, command: "next-server" },
      { pid: 35036, command: "node" },
    ]);
  });

  it("reads nothing from empty output, or a command with no process before it", () => {
    expect(listeners("")).toEqual([]);
    expect(listeners("cnode\n")).toEqual([]);
  });
});

describe("workingDirectory", () => {
  it("reads the name line, and null when there is none", () => {
    expect(workingDirectory(`p35147\nfcwd\nn${HERE}\n`)).toBe(HERE);
    expect(workingDirectory("")).toBeNull();
  });
});

describe("portsRefusal", () => {
  it("lets e2e start when nothing holds its ports", () => {
    expect(portsRefusal([], HERE)).toBeNull();
  });

  it("names this checkout's leftovers and how to stop them, once per process", () => {
    const text = portsRefusal(
      [holder(3001, 35147, HERE), holder(3002, 35036, HERE), holder(6380, 35036, HERE)],
      HERE
    );

    expect(text).toContain("  3001  pid 35147  cmd35147  this checkout");
    expect(text).toContain("kill 35147 35036");
    expect(text).not.toContain("elsewhere");
  });

  it("names another checkout's run and says to wait or move ports, without a kill", () => {
    const text = portsRefusal([holder(3001, 4100, THERE)], HERE);

    expect(text).toContain(`  3001  pid 4100  cmd4100  ${THERE}`);
    expect(text).toContain("wait for it, or set E2E_PORT, E2E_TASO_PORT and E2E_REDIS_PORT");
    expect(text).not.toContain("kill");
  });

  it("gives both answers when both hold a port, and names a holder in no checkout", () => {
    const text = portsRefusal([holder(3001, 1, HERE), holder(6380, 2, null)], HERE);

    expect(text).toContain("  6380  pid 2  cmd2  no checkout");
    expect(text).toContain("kill 1\n");
    expect(text).toContain("Held from elsewhere");
  });

  it("calls nothing this checkout's when this directory is in no checkout", () => {
    const text = portsRefusal([holder(3001, 1, null)], null);

    expect(text).not.toContain("this checkout");
    expect(text).toContain("Held from elsewhere");
  });
});
