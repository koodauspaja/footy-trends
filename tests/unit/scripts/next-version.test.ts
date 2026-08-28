import { describe, expect, it } from "vitest";
import {
  decideVersion,
  formatReleaseNotes,
  isMergeSubject,
  parseVersion,
} from "../../../scripts/next-version";

const c = (subject: string, body?: string) =>
  body === undefined ? { subject } : { subject, body };

describe("parseVersion", () => {
  it("accepts a tag with or without the v prefix", () => {
    expect(parseVersion("v1.2.3")).toEqual([1, 2, 3]);
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  it("rejects anything that is not a three-part version", () => {
    expect(() => parseVersion("v1.2")).toThrow(/Not a version tag/);
    expect(() => parseVersion("release-2")).toThrow(/Not a version tag/);
  });
});

describe("isMergeSubject", () => {
  it("recognises the merge commits a release itself produces", () => {
    expect(isMergeSubject("Merge pull request #190 from koodauspaja/chore/85")).toBe(true);
    expect(isMergeSubject("Merge branch 'main' into release")).toBe(true);
  });

  it("does not mistake an ordinary commit for one", () => {
    expect(isMergeSubject("feat: merge the two standings tables")).toBe(false);
  });
});

describe("decideVersion", () => {
  it("bumps the minor for a feat", () => {
    const d = decideVersion([c("feat: add the Helmarit page"), c("chore: tidy")], "v1.4.2");
    expect(d.next).toBe("v1.5.0");
    expect(d.bump).toBe("minor");
  });

  it("bumps the patch when there is no feat", () => {
    const d = decideVersion([c("fix: stop the blank page"), c("docs: explain why")], "v1.4.2");
    expect(d.next).toBe("v1.4.3");
    expect(d.bump).toBe("patch");
  });

  it("bumps the major for a ! subject, once past 1.0", () => {
    const d = decideVersion([c("feat!: drop the old URLs")], "v1.4.2");
    expect(d.next).toBe("v2.0.0");
    expect(d.bump).toBe("major");
  });

  it("bumps the major for a BREAKING CHANGE footer, once past 1.0", () => {
    const d = decideVersion(
      [c("refactor: rework routing", "BREAKING CHANGE: /matches is gone")],
      "v1.4.2"
    );
    expect(d.next).toBe("v2.0.0");
  });

  it("keeps a breaking change on the minor while below 1.0", () => {
    const d = decideVersion([c("feat!: drop the old URLs")], "v0.3.1");
    expect(d.next).toBe("v0.4.0");
    expect(d.bump).toBe("minor");
    expect(d.reasons.join(" ")).toMatch(/pre-1\.0/);
  });

  it("names the first release v0.1.0 rather than deriving it", () => {
    // `release` already holds the whole history, so the promotion range
    // describes only what followed the branch point. Deriving from it would
    // let a single docs commit name the first production release v0.0.1.
    const d = decideVersion([c("docs: one thing")], null);
    expect(d.previous).toBe("v0.0.0");
    expect(d.next).toBe("v0.1.0");
    expect(d.isFirstRelease).toBe(true);
    expect(d.reasons.join(" ")).toMatch(/first release/);
  });

  it("still reports the first release as v0.1.0 when the range has features", () => {
    const d = decideVersion([c("feat: a"), c("feat: b")], null);
    expect(d.next).toBe("v0.1.0");
    expect(d.isFirstRelease).toBe(true);
  });

  it("marks later releases as derived, not first", () => {
    const d = decideVersion([c("fix: a")], "v0.1.0");
    expect(d.isFirstRelease).toBe(false);
    expect(d.next).toBe("v0.1.1");
  });

  it("ignores the merge commit a release produces", () => {
    const d = decideVersion(
      [c("Merge pull request #1 from koodauspaja/x"), c("fix: one thing")],
      "v1.0.0"
    );
    expect(d.next).toBe("v1.0.1");
    expect(d.other).toHaveLength(0);
    expect(d.fixes).toEqual(["fix: one thing"]);
  });

  it("counts an unparseable subject as a patch rather than dropping it", () => {
    const d = decideVersion([c("tidied some things up")], "v1.0.0");
    expect(d.next).toBe("v1.0.1");
    expect(d.other).toEqual(["tidied some things up"]);
  });

  it("sorts commits into the groups release notes need", () => {
    const d = decideVersion(
      [
        c("feat!: breaking thing"),
        c("feat: new thing"),
        c("fix: fixed thing"),
        c("chore: other thing"),
      ],
      "v1.0.0"
    );
    expect(d.breaking).toEqual(["feat!: breaking thing"]);
    expect(d.features).toEqual(["feat: new thing"]);
    expect(d.fixes).toEqual(["fix: fixed thing"]);
    expect(d.other).toEqual(["chore: other thing"]);
  });

  it("takes the highest bump when several apply", () => {
    const d = decideVersion([c("fix: a"), c("feat: b"), c("feat!: c")], "v1.2.3");
    expect(d.bump).toBe("major");
    expect(d.next).toBe("v2.0.0");
  });
});

describe("formatReleaseNotes", () => {
  it("groups the commits under the headings that decided the version", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("feat: a thing"), c("fix: another"), c("chore: tidy")], "v1.0.0")
    );
    expect(notes).toContain("Changes since v1.0.0.");
    expect(notes).toContain("## Features\n\n- feat: a thing");
    expect(notes).toContain("## Fixes\n\n- fix: another");
    expect(notes).toContain("## Other\n\n- chore: tidy");
  });

  it("omits headings that have nothing under them", () => {
    const notes = formatReleaseNotes(decideVersion([c("fix: only this")], "v1.0.0"));
    expect(notes).not.toContain("## Features");
    expect(notes).not.toContain("## Breaking changes");
  });

  it("says so when it is the first release", () => {
    const notes = formatReleaseNotes(decideVersion([c("feat: a")], null));
    expect(notes).toContain("First release.");
  });

  it("never publishes an empty body, which would read as a mistake", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("Merge pull request #1 from koodauspaja/x")], "v1.0.0")
    );
    expect(notes).toContain("No categorised commits in this range.");
  });
});
