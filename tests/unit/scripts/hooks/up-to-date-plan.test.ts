import { describe, expect, it } from "vitest";
import { behindRefusal, branchPushes } from "../../../../scripts/hooks/up-to-date-plan";

/**
 * Which pushed refs the up-to-date check looks at, and what it says when a
 * branch is behind.
 *
 * decisions/806-push-and-pr-hooks.md
 */

const SHA = "a".repeat(40);
const ZERO = "0".repeat(40);

function line(remoteRef: string, sha = SHA, local = "refs/heads/x"): string {
  return `${local} ${sha} ${remoteRef} ${ZERO}`;
}

describe("branchPushes", () => {
  it("reads each pushed branch and its commit", () => {
    const stdin = `${line("refs/heads/chore/806-x")}\n${line("refs/heads/feature/1-y", "b".repeat(40))}\n`;

    expect(branchPushes(stdin)).toEqual([
      { branch: "chore/806-x", sha: SHA },
      { branch: "feature/1-y", sha: "b".repeat(40) },
    ]);
  });

  it("does not check main or release", () => {
    expect(branchPushes(`${line("refs/heads/main")}\n${line("refs/heads/release")}`)).toEqual([]);
  });

  it("does not check a tag or a deletion", () => {
    expect(
      branchPushes(`${line("refs/tags/v2.0.0")}\n${line("refs/heads/old", ZERO, "(delete)")}`)
    ).toEqual([]);
  });

  it("checks a branch only named like main", () => {
    expect(branchPushes(line("refs/heads/main-fix"))).toEqual([{ branch: "main-fix", sha: SHA }]);
  });

  it("reads nothing from blank input, and null from a line in another shape", () => {
    expect(branchPushes("\n  \n")).toEqual([]);
    expect(branchPushes("refs/heads/x abc refs/heads/x def")).toBeNull();
  });
});

describe("behindRefusal", () => {
  it("names the branches behind, says how to rebase and how to push anyway", () => {
    expect(behindRefusal(["chore/806-x"])).toContain("chore/806-x is behind origin/main");
    expect(behindRefusal(["a", "b"])).toContain("a, b are behind origin/main");
    expect(behindRefusal(["a"])).toContain("git rebase origin/main");
    expect(behindRefusal(["a"])).toContain("git push --no-verify");
  });
});
