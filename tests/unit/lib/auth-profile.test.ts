import { describe, expect, it } from "vitest";
import { displayNameFor } from "@/lib/auth-profile";

describe("displayNameFor", () => {
  it("uses the name Google returned", () => {
    expect(displayNameFor({ name: "Matti Meikäläinen", email: "matti@example.com" })).toBe(
      "Matti Meikäläinen"
    );
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["empty", ""],
    ["only whitespace", "   "],
  ])("falls back to the email's local part when the name is %s", (_case, name) => {
    expect(displayNameFor({ name, email: "matti.meikalainen@example.com" })).toBe(
      "matti.meikalainen"
    );
  });

  it("trims a padded name rather than rendering the padding", () => {
    expect(displayNameFor({ name: "  Matti  ", email: "matti@example.com" })).toBe("Matti");
  });

  it("falls back to the whole address when there is no local part", () => {
    // Not reachable through Google, but `user.name` is NOT NULL and an empty
    // string would satisfy the column while showing the reader nothing.
    expect(displayNameFor({ name: undefined, email: "@example.com" })).toBe("@example.com");
  });

  it("never returns an empty string, whatever the profile", () => {
    for (const name of [undefined, null, "", "  "]) {
      expect(displayNameFor({ name, email: "a@b.com" }).length).toBeGreaterThan(0);
    }
  });
});
