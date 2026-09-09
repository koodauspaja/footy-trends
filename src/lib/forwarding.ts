/**
 * The shape of a request's forwarding headers, from #309.
 *
 * **Why a shape and not the addresses.** better-auth refuses to resolve a
 * client IP from `x-forwarded-for` unless the header holds exactly one entry or
 * `trustedProxies` says which hops to skip — so choosing the right
 * configuration needs to know *how many* hops arrive and what kind they are.
 * The addresses themselves would answer that too, and `/api/health` is public,
 * so this reports the shape instead: counts and classifications, never a
 * value.
 */

export type HopKind = "public" | "private" | "invalid";

export type ForwardingShape = {
  /** How many comma-separated entries `x-forwarded-for` carried. */
  entries: number;
  /** Each entry classified, in the order sent — client first, as Railway sends it. */
  hops: HopKind[];
  /** Whether `x-real-ip` was present at all. */
  hasRealIp: boolean;
};

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * Private, loopback, link-local and carrier-grade NAT ranges.
 *
 * These matter because a hop inside one of them is infrastructure rather than a
 * reader: a request from the public internet cannot have such a source address,
 * so those are the hops `trustedProxies` would skip.
 */
function isPrivateIpv4(value: string): boolean {
  const octets = value.split(".").map(Number);
  // biome-ignore lint/style/noNonNullAssertion: only reached after IPV4 matched, so there are four numeric octets
  const first = octets[0]!;
  // biome-ignore lint/style/noNonNullAssertion: as above
  const second = octets[1]!;

  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 169 && second === 254) return true;
  // 100.64.0.0/10 — carrier-grade NAT, which is what container platforms
  // commonly use between their edge and an application.
  return first === 100 && second >= 64 && second <= 127;
}

/** Whether a string is a syntactically valid IPv6 address. */
function isIpv6(value: string): boolean {
  const halves = value.split("::");
  if (halves.length > 2) return false;

  const groupsIn = (part: string) => (part === "" ? [] : part.split(":"));
  const groups = halves.flatMap(groupsIn);
  if (!groups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) return false;

  // Compressed forms stand for at least one omitted group, so they carry fewer
  // than eight; an uncompressed address carries exactly eight.
  return halves.length === 2 ? groups.length < 8 : groups.length === 8;
}

/** An IPv4 address, already matched against the pattern. */
function classifyIpv4(value: string): HopKind {
  if (value.split(".").some((octet) => Number(octet) > 255)) return "invalid";
  return isPrivateIpv4(value) ? "private" : "public";
}

function classify(entry: string): HopKind {
  const value = entry.trim();

  // No empty-string guard: `forwardingShape` filters those out before calling
  // this, and an empty value falls through to "invalid" anyway. A branch that
  // cannot be taken reads as a handled case rather than an impossible one.
  if (IPV4.test(value)) return classifyIpv4(value);

  if (value.includes(":")) {
    const lower = value.toLowerCase();

    /**
     * An IPv4 address wearing an IPv6 spelling — `::ffff:10.0.0.1` is the
     * private `10.0.0.1`, and calling it public would put a real proxy hop on
     * the wrong side of the decision this diagnostic exists to inform.
     */
    const mapped = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
    const embedded = mapped?.[1];
    if (embedded !== undefined) return classifyIpv4(embedded);

    // Validated rather than assumed from the presence of a colon: `not:an:address`
    // was being reported as a public hop, which is the answer most likely to be
    // acted on and the one hardest to notice is wrong.
    if (!isIpv6(lower)) return "invalid";

    const isLoopback = lower === "::1";
    const isUniqueLocal = lower.startsWith("fc") || lower.startsWith("fd");
    const isLinkLocal = lower.startsWith("fe80");
    return isLoopback || isUniqueLocal || isLinkLocal ? "private" : "public";
  }

  return "invalid";
}

/** Reads the forwarding headers without recording a single address. */
export function forwardingShape(headers: Headers): ForwardingShape {
  const forwardedFor = headers.get("x-forwarded-for");
  const entries =
    forwardedFor === null ? [] : forwardedFor.split(",").filter((part) => part.trim() !== "");

  return {
    entries: entries.length,
    hops: entries.map(classify),
    hasRealIp: headers.get("x-real-ip") !== null,
  };
}
