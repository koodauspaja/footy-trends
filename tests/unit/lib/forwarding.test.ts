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
      hasRealIp: false,
    });
  });

  it("counts the hops in order, client first", () => {
    // Railway appends, so the reader is leftmost and the platform's own hops
    // follow. The order is what makes `trustedProxies` decidable.
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
    ["IPv6 public", "2001:db8::1", "public"],
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

  it("reports whether x-real-ip was present, without its value", () => {
    expect(forwardingShape(headersOf({ "x-real-ip": "203.0.113.5" })).hasRealIp).toBe(true);
    expect(forwardingShape(headersOf({})).hasRealIp).toBe(false);
  });
});
