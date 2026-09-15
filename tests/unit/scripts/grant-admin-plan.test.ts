import { describe, expect, it } from "vitest";
import {
  ambiguousAccount,
  describeOutcome,
  looksLikeEmail,
  normaliseEmail,
  noSuchAccount,
  parseArgs,
} from "../../../scripts/grant-admin-plan";

/**
 * The decisions behind granting and removing admin, from #371.
 *
 * `parseArgs` earns its tests: it reads a command line that writes to
 * production, and the failure it exists to prevent — an address that matches
 * nothing looking exactly like success — is the one the hand-written SQL had.
 */
describe("normaliseEmail", () => {
  it("lower-cases and trims, because the column holds what Google sent", () => {
    // An operator retyping an address will not match its case, and
    // `Matti@Example.fi` must find the row stored as `matti@example.fi`.
    expect(normaliseEmail("  Matti@Example.FI  ")).toBe("matti@example.fi");
  });

  it("leaves an already-normal address alone", () => {
    expect(normaliseEmail("matti@example.fi")).toBe("matti@example.fi");
  });
});

describe("looksLikeEmail", () => {
  it.each([
    ["an ordinary address", "matti@example.fi"],
    ["a subdomain", "matti@mail.example.fi"],
    ["a plus tag", "matti+admin@example.fi"],
  ])("accepts %s", (_case, value) => {
    expect(looksLikeEmail(value)).toBe(true);
  });

  it.each([
    ["no at sign", "matti.example.fi"],
    ["two at signs", "matti@@example.fi"],
    ["nothing before the at", "@example.fi"],
    ["nothing after the at", "matti@"],
    ["a space", "matti @example.fi"],
    ["the empty string", ""],
    ["a flag passed by mistake", "--role=admin"],
  ])("refuses %s", (_case, value) => {
    expect(looksLikeEmail(value)).toBe(false);
  });
});

describe("parseArgs", () => {
  it("grants by default, because that is what the setup document is about", () => {
    expect(parseArgs(["--email=matti@example.fi"])).toEqual({
      ok: true,
      request: { email: "matti@example.fi", role: "admin" },
    });
  });

  it("removes admin when asked", () => {
    expect(parseArgs(["--email=matti@example.fi", "--role=user"])).toEqual({
      ok: true,
      request: { email: "matti@example.fi", role: "user" },
    });
  });

  it("normalises the address it returns", () => {
    const result = parseArgs(["--email=  Matti@Example.FI "]);

    expect(result).toMatchObject({ request: { email: "matti@example.fi" } });
  });

  it.each([
    ["no arguments at all", [], "--email is required."],
    ["an empty email", ["--email="], "--email is required."],
    ["a whitespace email", ["--email=   "], "--email is required."],
  ])("refuses %s", (_case, argv, message) => {
    expect(parseArgs(argv as string[])).toEqual({ ok: false, message });
  });

  it("refuses an address that is not one, naming what it was given", () => {
    const result = parseArgs(["--email=not-an-address"]);

    expect(result).toEqual({
      ok: false,
      message: "That does not look like an address: not-an-address",
    });
  });

  it.each([
    ["ADMIN", "admin"],
    ["Admin", "admin"],
    ["USER", "user"],
    ["  user  ", "user"],
  ])("accepts --role=%s as %s", (given, expected) => {
    // The address is normalised, so the role is too — an operator typing
    // `--role=ADMIN` means the role, and refusing it teaches them nothing.
    const result = parseArgs(["--email=matti@example.fi", `--role=${given}`]);

    expect(result).toMatchObject({ request: { role: expected } });
  });

  it("refuses a role that is neither", () => {
    // The mutation this guards is accepting any string: `--role=superuser`
    // would write a value nothing recognises, and `isRole` would read it back
    // as a reader — a grant that silently did nothing.
    expect(parseArgs(["--email=matti@example.fi", "--role=superuser"])).toEqual({
      ok: false,
      message: "--role must be admin or user, not: superuser",
    });
  });

  it("refuses a positional argument rather than guessing what it meant", () => {
    // Two bare strings in the wrong order is a mistake the shape of the command
    // should not permit, on something that writes to production.
    expect(parseArgs(["matti@example.fi"])).toEqual({
      ok: false,
      message: "Unrecognised argument: matti@example.fi",
    });
  });

  it.each([
    [
      "--email",
      ["--email=right@example.fi", "--email=typo@example.fi"],
      "--email was given more than once.",
    ],
    [
      "--role",
      ["--email=a@example.fi", "--role=admin", "--role=user"],
      "--role was given more than once.",
    ],
  ])("refuses a repeated %s rather than letting the last one win", (_case, argv, message) => {
    // This writes to production. A wrapper script or an edited shell-history
    // line is how the same flag ends up twice, and silently acting on the
    // second is the class of mistake the script exists to remove.
    expect(parseArgs(argv as string[])).toEqual({ ok: false, message });
  });

  it("refuses a flag it does not know", () => {
    expect(parseArgs(["--email=matti@example.fi", "--force=yes"])).toEqual({
      ok: false,
      message: "Unrecognised argument: --force",
    });
  });
});

describe("describeOutcome", () => {
  it("reports a change as before and after", () => {
    expect(describeOutcome("matti@example.fi", "user", "admin")).toBe(
      "matti@example.fi: user → admin"
    );
  });

  it("says nothing changed when the role was already what was asked for", () => {
    // Reporting a grant that did not happen is the failure mode the whole
    // script exists to remove.
    expect(describeOutcome("matti@example.fi", "admin", "admin")).toBe(
      "matti@example.fi was already admin — nothing changed."
    );
  });

  it("describes a removal the same way", () => {
    expect(describeOutcome("matti@example.fi", "admin", "user")).toBe(
      "matti@example.fi: admin → user"
    );
  });
});

describe("noSuchAccount", () => {
  it("says why there might be no row, not just that there is none", () => {
    expect(noSuchAccount("matti@example.fi")).toBe(
      "No account with the address matti@example.fi. They must sign in once before a role can be set."
    );
  });
});

describe("ambiguousAccount", () => {
  it("names every account it found, and says nothing was changed", () => {
    // `user.email` is unique on the raw text, which is case-sensitive, while
    // this script matches on `lower(email)` so an operator's typing finds a row
    // stored as Google sent it. Both spellings can therefore exist — verified
    // against Postgres, where the two inserted successfully and one predicate
    // matched them both.
    expect(ambiguousAccount("dup@example.fi", ["Dup@Example.fi", "dup@example.fi"])).toBe(
      [
        "More than one account matches dup@example.fi, differing only in case:",
        "  Dup@Example.fi",
        "  dup@example.fi",
        "Nothing was changed. Resolve the duplicate before setting a role.",
      ].join("\n")
    );
  });

  it("says nothing was changed, because that is the part that matters", () => {
    // Acting on the first would be a coin toss and acting on all would change
    // accounts the operator never named, so the message has to make clear that
    // neither happened.
    expect(ambiguousAccount("dup@example.fi", ["A@b.fi", "a@b.fi"])).toContain(
      "Nothing was changed."
    );
  });
});

describe("the refusal message for a bad role", () => {
  it("quotes what the operator typed, not the normalised form", () => {
    // `--role=SuperUser` refused as `superuser` would leave them looking for a
    // word they did not write.
    expect(parseArgs(["--email=a@example.fi", "--role=SuperUser"])).toEqual({
      ok: false,
      message: "--role must be admin or user, not: SuperUser",
    });
  });
});
