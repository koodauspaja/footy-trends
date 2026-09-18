import { describe, expect, it } from "vitest";
import { ERROR_PARAM, returnPath, withError } from "@/lib/return-path";

describe("returnPath", () => {
  it("keeps the page's own state", () => {
    expect(returnPath("/kotimaa/joukkue/1", new URLSearchParams("kilpailu=VL&kausi=2024"))).toBe(
      "/kotimaa/joukkue/1?kilpailu=VL&kausi=2024"
    );
  });

  it("drops a previous attempt's error, and the ? with it when nothing is left", () => {
    expect(returnPath("/", new URLSearchParams("error=auth"))).toBe("/");
    expect(returnPath("/a", new URLSearchParams("kausi=2024&error=auth"))).toBe("/a?kausi=2024");
  });

  it("does not change the params it was given", () => {
    const params = new URLSearchParams("error=auth");
    returnPath("/", params);

    expect(params.get(ERROR_PARAM)).toBe("auth");
  });
});

describe("withError", () => {
  it("reports through ?error= and keeps the page's state", () => {
    expect(withError("/a", new URLSearchParams("kausi=2024"), "auth")).toBe(
      "/a?kausi=2024&error=auth"
    );
  });

  it("replaces an earlier error rather than adding a second", () => {
    expect(withError("/a", new URLSearchParams("error=old"), "auth")).toBe("/a?error=auth");
  });

  it("does not change the params it was given", () => {
    const params = new URLSearchParams("kausi=2024");
    withError("/a", params, "auth");

    expect(params.has(ERROR_PARAM)).toBe(false);
  });
});
