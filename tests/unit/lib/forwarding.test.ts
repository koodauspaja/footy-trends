import { describe, expect, it } from "vitest";
import { forwardingShape } from "@/lib/forwarding";

/**
 * Reading the forwarding headers' shape, from #309.
 *
 * The point of these is what they *do not* return. `/api/health` is public, so
 * the diagnostic answers "how many hops, and which are infrastructure" without
 * ever reporting an address.
 */
const headersOf = (values: Record<string, string>) => new Headers(values);

describe("forwardingShape", () => {
  it("reports nothing arriving when the header is absent", () => {
    expect(forwardingShape(headersOf({}))).toEqual({
      entries: 0,
      hops: [],
      candidates: {},
    });
  });

  it("preserves the order of forwarded entries", () => {
    // The order is what makes `trustedProxies` decidable, so it is preserved
    // rather than sorted or deduplicated. Which end the reader sits at is a
    // property of the platform, not of this function — measured, not assumed.
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "203.0.113.5, 100.64.0.1, 10.0.0.7" })
    );

    expect(shape.entries).toBe(3);
    expect(shape.hops).toEqual(["public", "private", "private"]);
  });

  it("never returns an address", () => {
    const shape = forwardingShape(headersOf({ "x-forwarded-for": "203.0.113.5, 10.0.0.7" }));

    expect(JSON.stringify(shape)).not.toContain("203.0.113.5");
    expect(JSON.stringify(shape)).not.toContain("10.0.0.7");
  });

  it.each([
    ["a public address", "203.0.113.5", "public"],
    ["RFC1918 ten", "10.1.2.3", "private"],
    ["RFC1918 one-nine-two", "192.168.1.1", "private"],
    ["RFC1918 one-seven-two, in range", "172.16.0.1", "private"],
    ["one-seven-two, out of range", "172.32.0.1", "public"],
    ["loopback", "127.0.0.1", "private"],
    ["link-local", "169.254.1.1", "private"],
    // 100.64.0.0/10, which container platforms commonly use between edge and app
    // — the class most likely to appear here and the reason for classifying at all.
    ["carrier-grade NAT", "100.64.0.1", "private"],
    ["just outside carrier-grade NAT", "100.128.0.1", "public"],
    ["IPv6 loopback", "::1", "private"],
    ["IPv6 unique-local", "fd00::1", "private"],
    ["IPv6 link-local", "fe80::1", "private"],
    // fe80::/10 spans fe80–febf, so a prefix test on the text reported these
    // two as public and would have left a real infrastructure hop untrusted.
    ["IPv6 link-local, mid-range", "fe90::1", "private"],
    ["IPv6 link-local, top of range", "febf::1", "private"],
    ["just past link-local", "fec0::1", "public"],
    // fc00::/7 is fc00–fdff.
    ["IPv6 unique-local, top of range", "fdff::1", "private"],
    ["just past unique-local", "fe00::1", "public"],
    ["IPv6 public", "2001:db8::1", "public"],
    ["IPv6 uncompressed", "2001:0db8:0000:0000:0000:0000:0000:0001", "public"],
    // An IPv4 address wearing an IPv6 spelling. Calling this public would put a
    // real proxy hop on the wrong side of the decision the diagnostic informs.
    ["IPv4-mapped private", "::ffff:10.0.0.1", "private"],
    ["IPv4-mapped public", "::ffff:203.0.113.5", "public"],
    ["IPv4-compatible private", "::10.0.0.1", "private"],
    // The IPv6 spelling matches, the dotted quad inside it does not: neither
    // family accepts this, so it is an address in no reading.
    ["IPv4-mapped with an octet past 255", "::ffff:999.1.1.1", "invalid"],
    // Expanded IPv4-mapped: private, and classifying it as ordinary IPv6 called
    // a real infrastructure hop public.
    ["IPv4-mapped private, expanded", "0:0:0:0:0:ffff:0a00:0001", "private"],
    ["IPv4-mapped public, expanded", "0:0:0:0:0:ffff:cb00:7105", "public"],
    // ::ffff:0:1 is not mapped — group six must be ffff, not group five.
    ["IPv6 that merely contains ffff", "ffff::1", "public"],
    // Colons alone used to be enough to be called a public hop — the answer
    // most likely to be acted on, and the hardest to notice is wrong.
    // Valid IPv6 with a dotted tail — rejected as invalid until the address was
    // expanded rather than pattern-matched.
    ["IPv6 with an embedded IPv4 tail", "2001:db8::192.0.2.1", "public"],
    ["an embedded IPv4 that is not last", "2001:db8::1.2.3.4:abcd", "invalid"],
    ["an embedded IPv4 with a bad octet", "2001:db8::300.0.2.1", "invalid"],
    ["text with colons", "not:an:address", "invalid"],
    ["too few groups, uncompressed", "1:2:3:4:5:6:7", "invalid"],
    ["compression standing for nothing", "1:2:3:4:5:6:7:8::9", "invalid"],
    ["too many groups", "1:2:3:4:5:6:7:8:9", "invalid"],
    ["a group that is too long", "12345::1", "invalid"],
    ["two compressions", "1::2::3", "invalid"],
    ["an octet past 255", "999.1.1.1", "invalid"],
    ["not an address at all", "unknown", "invalid"],
  ])("classifies %s", (_case, value, expected) => {
    expect(forwardingShape(headersOf({ "x-forwarded-for": value })).hops).toEqual([expected]);
  });

  it("ignores empty entries rather than counting them as hops", () => {
    // A trailing comma is common enough in forwarded headers, and counting it
    // would make a single-hop request look like two.
    expect(forwardingShape(headersOf({ "x-forwarded-for": "203.0.113.5, " })).entries).toBe(1);
  });

  it("lists only the single-value headers that arrived", () => {
    // Absent headers are omitted rather than reported as absent, so `{}` is the
    // whole answer for a request that carried none.
    expect(forwardingShape(headersOf({ "x-real-ip": "203.0.113.5" })).candidates).toEqual({
      "x-real-ip": { valid: true, matchesEntries: [] },
    });
    expect(forwardingShape(headersOf({})).candidates).toEqual({});
  });

  it.each(["x-real-ip", "x-envoy-external-address", "cf-connecting-ip", "true-client-ip"])(
    "compares %s against the forwarded chain",
    (name) => {
      // Asking about one header at a time costs a deployment per guess, so all
      // four are answered from the same request.
      const shape = forwardingShape(
        headersOf({ "x-forwarded-for": "203.0.113.5, 100.64.0.1", [name]: "100.64.0.1" })
      );

      expect(shape.candidates[name]).toEqual({ valid: true, matchesEntries: [1] });
    }
  );

  it("names the entry the header agrees with, which is the measurement", () => {
    // A header the edge wrote agrees with a hop the edge wrote, and the index
    // says which end of the chain the client sits at. Index 0 here, so leftmost.
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "203.0.113.5, 100.64.0.1", "x-real-ip": "203.0.113.5" })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [0] });
  });

  it("matches across two spellings of one address", () => {
    // The edge is free to write `::ffff:203.0.113.5` in one header and the
    // dotted form in the other; reading that as two hops would report a
    // trustworthy header as client-controlled.
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "::ffff:203.0.113.5", "x-real-ip": "203.0.113.5" })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [0] });
  });

  it("matches two spellings of one IPv6 address", () => {
    const shape = forwardingShape(
      headersOf({
        "x-forwarded-for": "2001:DB8::1",
        "x-real-ip": "2001:0db8:0000:0000:0000:0000:0000:0001",
      })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [0] });
  });

  it("reports every matching entry, not just the first", () => {
    // `A, B, A` with `indexOf` always answered 0, so the diagnostic could not
    // say which occurrence the platform meant.
    const shape = forwardingShape(
      headersOf({
        "x-forwarded-for": "203.0.113.5, 100.64.0.1, 203.0.113.5",
        "x-real-ip": "203.0.113.5",
      })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [0, 2] });
  });

  it("matches an IPv4-mapped address however it is spelled", () => {
    // A proxy may emit the expanded form; reading that as ordinary IPv6 reported
    // no match between two headers carrying one address.
    const shape = forwardingShape(
      headersOf({
        "x-forwarded-for": "0:0:0:0:0:ffff:cb00:7105",
        "x-real-ip": "203.0.113.5",
      })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [0] });
  });

  it("matches across leading zeros inside an IPv4-mapped address", () => {
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "::ffff:010.000.000.001", "x-real-ip": "10.0.0.1" })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [0] });
  });

  it("matches across leading zeros in a dotted quad", () => {
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "010.000.000.001", "x-real-ip": "10.0.0.1" })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [0] });
  });

  it("reports a header matching nothing, which is what a sentinel probe looks like", () => {
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "203.0.113.5, 100.64.0.1", "x-real-ip": "198.51.100.9" })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: true, matchesEntries: [] });
  });

  it("does not match one unparseable value to another", () => {
    // Both fail to parse, and comparing the raw text would call them equal —
    // reporting a header the client set as one the edge wrote.
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "not:an:address", "x-real-ip": "not:an:address" })
    );

    expect(shape.candidates["x-real-ip"]).toEqual({ valid: false, matchesEntries: [] });
  });

  it("still returns no address once the headers are compared", () => {
    const shape = forwardingShape(
      headersOf({ "x-forwarded-for": "203.0.113.5, 10.0.0.7", "x-real-ip": "203.0.113.5" })
    );

    expect(JSON.stringify(shape)).not.toContain("203.0.113.5");
    expect(JSON.stringify(shape)).not.toContain("10.0.0.7");
  });
});
