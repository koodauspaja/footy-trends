import { describe, expect, it } from "vitest";
import {
  decideVersion,
  describeCommit,
  formatReleaseNotes,
  InvalidFirstReleaseVersion,
  isMergeSubject,
  isStableVersionTag,
  parseVersion,
  selectPreviousTag,
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

describe("isStableVersionTag", () => {
  it("accepts a plain three-part version, with or without the v", () => {
    expect(isStableVersionTag("v1.2.3")).toBe(true);
    expect(isStableVersionTag("1.2.3")).toBe(true);
  });

  it("rejects the tags that would otherwise crash the release workflow", () => {
    // `git tag --list v*` matches all of these, and parseVersion throws on
    // them — one hand-made tag would take the whole release down.
    expect(isStableVersionTag("v1.0.0-rc.1")).toBe(false);
    expect(isStableVersionTag("v2-old")).toBe(false);
    expect(isStableVersionTag("v1.0")).toBe(false);
    expect(isStableVersionTag("version-one")).toBe(false);
  });
});

describe("selectPreviousTag", () => {
  it("takes the newest tag when nothing is on HEAD", () => {
    expect(selectPreviousTag(["v1.2.0", "v1.1.0"], [])).toBe("v1.2.0");
  });

  it("skips a tag already on HEAD, so a rerun reproduces the same range", () => {
    // The tag was pushed but publishing the notes failed. Treating it as the
    // previous tag would compute an empty range and strand the release with no
    // notes and no way to recover by rerunning.
    expect(selectPreviousTag(["v1.2.0", "v1.1.0"], ["v1.2.0"])).toBe("v1.1.0");
  });

  it("ignores non-stable tags on the way", () => {
    expect(selectPreviousTag(["v2.0.0-rc.1", "v1.1.0"], [])).toBe("v1.1.0");
  });

  it("returns null when nothing usable remains", () => {
    expect(selectPreviousTag(["v1.0.0"], ["v1.0.0"])).toBeNull();
    expect(selectPreviousTag([], [])).toBeNull();
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

  it("lets FIRST_RELEASE_VERSION name the first release", () => {
    // Whether a first tag is 0.x or 1.0.0 is a statement about stability, not a
    // fact about the commits, so it is the one thing the tool cannot derive.
    const d = decideVersion([c("docs: one thing")], null, { firstReleaseVersion: "v1.0.0" });
    expect(d.next).toBe("v1.0.0");
    expect(d.reasons.join(" ")).toMatch(/named explicitly/);
  });

  it("accepts the override without a v prefix", () => {
    expect(decideVersion([c("docs: x")], null, { firstReleaseVersion: "1.0.0" }).next).toBe(
      "v1.0.0"
    );
  });

  it("ignores the override once anything is tagged, so it cannot leak", () => {
    // Self-limiting by design: a variable left set after the first release must
    // not turn v0.1.1 into v1.0.0 forever after.
    const d = decideVersion([c("fix: x")], "v0.1.0", { firstReleaseVersion: "v1.0.0" });
    expect(d.next).toBe("v0.1.1");
  });

  it("throws on a mistyped override rather than quietly using the default", () => {
    expect(() =>
      decideVersion([c("docs: x")], null, { firstReleaseVersion: "one-point-oh" })
    ).toThrow(InvalidFirstReleaseVersion);
  });

  it("treats a blank override as absent", () => {
    expect(decideVersion([c("docs: x")], null, { firstReleaseVersion: "   " }).next).toBe("v0.1.0");
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
    expect(notes).toContain("# release: v1.1.0");
    expect(notes).toContain("Changes since v1.0.0 — 1 feature, 1 bug, 1 chore.");
    expect(notes).toContain("## Features\n\n| | |\n|---|---|\n|  | A thing |");
    // `fix:` is a bug and everything else is a chore. "Fixes"/"Other" named the
    // classification rather than the work.
    expect(notes).toContain("## Bugs\n\n| | |\n|---|---|\n|  | Another |");
    expect(notes).toContain("## Chores\n\n| | |\n|---|---|\n|  | Tidy |");
  });

  it("escapes a vertical bar, which would otherwise split the row into extra columns", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("feat: accept a|b as a separator (#9) (#10)")], "v1.0.0")
    );
    expect(notes).toContain("| #9 | Accept a\\|b as a separator |");
  });

  it("renders each entry as an issue reference and a sentence", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("feat: settle Sentry's production configuration (#140) (#204)")], "v1.0.0")
    );
    expect(notes).toContain("| #140 | Settle Sentry's production configuration |");
    expect(notes).not.toContain("feat:");
    expect(notes).not.toContain("(#204)");
  });

  it("pluralises the counts, and names only the categories with anything in them", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("feat: a"), c("feat: b"), c("chore: c")], "v1.0.0")
    );
    expect(notes).toContain("— 2 features, 1 chore.");
    expect(notes).not.toContain("bug");
  });

  it("adds no counts to a release with nothing categorised", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("Merge pull request #1 from koodauspaja/x")], "v1.0.0")
    );
    expect(notes).toContain("Changes since v1.0.0.");
  });

  it("counts a breaking change in the preamble", () => {
    const notes = formatReleaseNotes(decideVersion([c("feat!: a")], "v1.0.0"));
    expect(notes).toContain("— 1 breaking change.");
  });

  it("pluralises breaking changes and bugs", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("feat!: a"), c("feat!: b"), c("fix: x"), c("fix: y")], "v1.0.0")
    );
    expect(notes).toContain("— 2 breaking changes, 2 bugs.");
  });

  it("omits headings that have nothing under them", () => {
    const notes = formatReleaseNotes(decideVersion([c("fix: only this")], "v1.0.0"));
    expect(notes).not.toContain("## Features");
    expect(notes).not.toContain("## Breaking changes");
  });

  it("does not present the promotion range as a first release's contents", () => {
    // `release` is branched from `main` and already carries everything before
    // the branch point, so the range is a tail rather than a changelog. Listing
    // it under a bare "Features" heading understated the first release by two
    // orders of magnitude — 5 commits shown for 243 deployed.
    const notes = formatReleaseNotes(decideVersion([c("feat: a")], null));
    expect(notes).toContain("the whole application reaching production");
    expect(notes).toContain("**not** the contents of this release");
    expect(notes).toContain("## Features since the branch point");
    expect(notes).not.toContain("## Features\n");
  });

  it("keeps the plain headings for a later release, where the range is the contents", () => {
    const notes = formatReleaseNotes(decideVersion([c("feat: a")], "v1.0.0"));
    expect(notes).toContain("Changes since v1.0.0 — 1 feature.");
    expect(notes).toContain("## Features\n");
    expect(notes).not.toContain("since the branch point");
  });

  it("never publishes an empty body, which would read as a mistake", () => {
    const notes = formatReleaseNotes(
      decideVersion([c("Merge pull request #1 from koodauspaja/x")], "v1.0.0")
    );
    expect(notes).toContain("No categorised commits in this range.");
  });
});

describe("describeCommit", () => {
  it("takes the issue reference, not the pull request, when the subject has both", () => {
    // A squash merge appends its own (#N), so a subject that already named an
    // issue ends with two. The issue says why the work happened.
    expect(describeCommit("chore: repair the allowlist (#210) (#212)")).toEqual({
      ref: "#210",
      description: "Repair the allowlist",
    });
  });

  it("uses the only reference when a commit names no issue, as Renovate's do", () => {
    expect(describeCommit("chore(deps): update dependency x to v2 (#145)")).toEqual({
      ref: "#145",
      description: "Update dependency x to v2",
    });
  });

  it("returns no reference when the subject carries none", () => {
    expect(describeCommit("feat: a thing")).toEqual({ ref: null, description: "A thing" });
  });

  it("keeps a subject that does not parse as a conventional commit", () => {
    expect(describeCommit("tidied things up")).toEqual({
      ref: null,
      description: "Tidied things up",
    });
  });

  it("strips the scope along with the type", () => {
    expect(describeCommit("fix(deps): bump the thing")).toEqual({
      ref: null,
      description: "Bump the thing",
    });
  });

  it("leaves an already-capitalised description alone", () => {
    expect(describeCommit("feat: TASO groups are synced").description).toBe(
      "TASO groups are synced"
    );
  });

  it("survives an empty summary without throwing", () => {
    expect(describeCommit("feat: (#12)")).toEqual({ ref: "#12", description: "" });
  });
});
