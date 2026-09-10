import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allowedSignInEmails, refusesSignIn, signInRefusal } from "@/lib/sign-in-allowlist";
import { SIGN_IN_NOT_ALLOWED } from "@/lib/sign-in-refusal";

/**
 * Who may sign in, from #314.
 *
 * The variable is read on every call rather than at import, so these stub it
 * per test — that property is the point of the design and one of the tests.
 */
beforeEach(() => {
  // Stubbed empty rather than trusted to be absent: a developer with this set
  // locally to exercise the feature would otherwise fail every unrestricted
  // case, and the failure would look like a bug in the code under test.
  vi.stubEnv("AUTH_ALLOWED_EMAILS", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("allowedSignInEmails", () => {
  it("is empty when the variable is unset", () => {
    expect(allowedSignInEmails()).toEqual([]);
  });

  it("is empty when the variable is absent entirely, not merely blank", () => {
    // `stubEnv(name, undefined)` deletes it, which is what CI and production
    // actually look like — the `?? ""` fallback is only reachable this way, and
    // the blank default above hides it.
    vi.stubEnv("AUTH_ALLOWED_EMAILS", undefined);

    expect(allowedSignInEmails()).toEqual([]);
    expect(refusesSignIn("anyone@example.fi")).toBe(false);
  });

  it.each([
    ["blank", "   "],
    ["separators only", " , ,, "],
  ])("is empty when the variable holds %s", (_case, value) => {
    // A cleared Railway variable must read as "no list", not as a list of one
    // empty string that nothing can ever match.
    vi.stubEnv("AUTH_ALLOWED_EMAILS", value);

    expect(allowedSignInEmails()).toEqual([]);
  });

  it("trims and lower-cases what it is given", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", " Miikka@Example.FI , kalle@example.fi ");

    expect(allowedSignInEmails()).toEqual(["miikka@example.fi", "kalle@example.fi"]);
  });
});

describe("refusesSignIn", () => {
  it("refuses nobody when no list is configured", () => {
    // Production's consent screen is published on purpose, and local
    // development has no list either. Silence must mean today's behaviour.
    expect(refusesSignIn("anyone@example.fi")).toBe(false);
  });

  it("admits an address on the list", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi,kalle@example.fi");

    expect(refusesSignIn("kalle@example.fi")).toBe(false);
  });

  it("admits regardless of how the provider capitalises it", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi");

    expect(refusesSignIn("Miikka@Example.FI")).toBe(false);
  });

  it("refuses an address that is not on the list", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi");

    expect(refusesSignIn("stranger@example.fi")).toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["not a string", 42],
  ])("refuses an identity whose email is %s", (_case, email) => {
    // Admitting what cannot be checked is the opposite of an allowlist.
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi");

    expect(refusesSignIn(email)).toBe(true);
  });

  it("does not match a partial address", () => {
    // `includes` on a joined string rather than on the list would admit anyone
    // whose address happened to be a substring of a configured one.
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi");

    expect(refusesSignIn("iikka@example.fi")).toBe(true);
  });
});

describe("signInRefusal", () => {
  it("answers nothing for an admitted identity, which better-auth reads as allowed", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi");

    expect(signInRefusal("miikka@example.fi")).toBeUndefined();
  });

  it("answers the refusal code, which the query string carries to the reader", () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi");

    expect(signInRefusal("stranger@example.fi")).toEqual({ error: SIGN_IN_NOT_ALLOWED });
  });

  it("reflects a variable changed after the module was imported", () => {
    // The whole point of a variable: adding a person is a Railway change, not a
    // new image. A value captured at module scope would need a redeploy.
    expect(signInRefusal("kalle@example.fi")).toBeUndefined();

    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi");
    expect(signInRefusal("kalle@example.fi")).toEqual({ error: SIGN_IN_NOT_ALLOWED });

    vi.stubEnv("AUTH_ALLOWED_EMAILS", "miikka@example.fi,kalle@example.fi");
    expect(signInRefusal("kalle@example.fi")).toBeUndefined();
  });
});
