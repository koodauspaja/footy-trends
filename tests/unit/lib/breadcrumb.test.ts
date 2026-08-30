import { describe, expect, it } from "vitest";
import { regionCrumbFor } from "@/lib/breadcrumb";

describe("regionCrumbFor", () => {
  it.each([
    ["/kotimaa/sarjataulukko", "Kotimaa", "/kotimaa"],
    ["/kotimaa/ottelut", "Kotimaa", "/kotimaa"],
    ["/kotimaa/joukkue/12", "Kotimaa", "/kotimaa"],
    ["/ulkomaat/sarjataulukko", "Ulkomaat", "/ulkomaat"],
    ["/ulkomaat/joukkue/57", "Ulkomaat", "/ulkomaat"],
    ["/maajoukkueet/ottelut", "Maajoukkueet", "/maajoukkueet"],
    ["/maajoukkueet/huuhkajat", "Maajoukkueet", "/maajoukkueet"],
    ["/maajoukkueet/helmarit", "Maajoukkueet", "/maajoukkueet"],
  ])("names the region for %s", (pathname, label, href) => {
    expect(regionCrumbFor(pathname)).toEqual({ href, label });
  });

  // A crumb here would link to the page already being shown.
  it.each(["/kotimaa", "/ulkomaat", "/maajoukkueet"])("gives no crumb on %s itself", (pathname) => {
    expect(regionCrumbFor(pathname)).toBeNull();
  });

  it("gives no crumb on a region path with a trailing slash", () => {
    expect(regionCrumbFor("/kotimaa/")).toBeNull();
  });

  it("gives no crumb on the front page", () => {
    expect(regionCrumbFor("/")).toBeNull();
  });

  it("gives no crumb for an unknown path", () => {
    expect(regionCrumbFor("/jotain-muuta")).toBeNull();
  });

  // `/kotimaajoukkueet` starts with `/kotimaa` as a string but is not inside
  // it, which a bare `startsWith` would get wrong.
  it("does not mistake a longer first segment for a region", () => {
    expect(regionCrumbFor("/kotimaajoukkueet/sarjataulukko")).toBeNull();
  });

  it("still resolves a region path with a trailing slash on a subpage", () => {
    expect(regionCrumbFor("/ulkomaat/ottelut/")).toEqual({
      href: "/ulkomaat",
      label: "Ulkomaat",
    });
  });
});
