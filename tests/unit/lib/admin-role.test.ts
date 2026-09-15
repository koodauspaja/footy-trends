import { describe, expect, it } from "vitest";
import { DEFAULT_ROLE, isAdmin, isRole, ROLES } from "@/lib/admin-role";

/**
 * The role vocabulary, from specs/028-admin-tools-and-roles.md.
 *
 * `isAdmin` is the one that earns real tests: it decides an authorisation, it
 * takes `unknown` because the value arrives from a `text` column and from
 * session payloads, and the direction it fails in matters more than anywhere
 * else in the app.
 */
describe("the role vocabulary", () => {
  it("has exactly the two roles, and defaults to the harmless one", () => {
    // A third role is a design question rather than a column change; if one is
    // ever added, this test is the place that says so out loud.
    expect([...ROLES]).toEqual(["user", "admin"]);
    expect(DEFAULT_ROLE).toBe("user");
  });

  it.each(["user", "admin"])("recognises %s as a role", (value) => {
    expect(isRole(value)).toBe(true);
  });

  it.each([
    ["an unknown string", "superuser"],
    ["the empty string", ""],
    ["a different case", "Admin"],
    ["null", null],
    ["undefined", undefined],
    ["a number", 1],
    ["an object", { role: "admin" }],
  ])("does not recognise %s as a role", (_case, value) => {
    expect(isRole(value)).toBe(false);
  });
});

describe("isAdmin", () => {
  it("is true for exactly the admin role", () => {
    expect(isAdmin("admin")).toBe(true);
  });

  it.each([
    ["a reader", "user"],
    ["a role that does not exist", "superuser"],
    ["the wrong case", "Admin"],
    ["the wrong case again", "ADMIN"],
    ["leading whitespace", " admin"],
    ["trailing whitespace", "admin "],
    ["the empty string", ""],
    ["null", null],
    ["undefined", undefined],
    ["a number", 1],
    ["true", true],
    ["an object claiming the role", { role: "admin" }],
    ["an array containing it", ["admin"]],
  ])("is false for %s", (_case, value) => {
    expect(isAdmin(value)).toBe(false);
  });

  it("cannot be satisfied by a value that merely contains the word", () => {
    // The mutation this guards is `String(value).includes("admin")`, which
    // would grant admin to "not-an-admin" and to "readmin".
    expect(isAdmin("not-an-admin")).toBe(false);
    expect(isAdmin("readmin")).toBe(false);
  });
});
