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

/** The four octets of a dotted quad, or null when it is not one. */
function ipv4Octets(value: string): number[] | null {
  if (!IPV4.test(value)) return null;
  const octets = value.split(".").map(Number);
  return octets.some((octet) => octet > 255) ? null : octets;
}

/**
 * An IPv6 address expanded to its eight 16-bit groups, or null when it is not
 * a valid address.
 *
 * Expanding rather than pattern-matching the text is what makes the
 * classification below correct: link-local is `fe80::/10`, which spans `fe80`
 * through `febf`, and a prefix test on the string reports `fe90::1` as public.
 *
 * A dotted-decimal tail is allowed in the final position, which is what makes
 * `2001:db8::192.0.2.1` a valid address rather than a malformed one.
 */
function expandIpv6(value: string): number[] | null {
  const halves = value.split("::");
  if (halves.length > 2) return null;

  const groupsIn = (part: string | undefined): number[] | null => {
    if (part === undefined || part === "") return [];

    const groups: number[] = [];
    const parts = part.split(":");
    for (const [index, raw] of parts.entries()) {
      const octets = ipv4Octets(raw);
      if (octets !== null) {
        // Only ever the last component; `1.2.3.4:abcd` is not an address.
        if (index !== parts.length - 1) return null;
        groups.push((octets[0] as number) * 256 + (octets[1] as number));
        groups.push((octets[2] as number) * 256 + (octets[3] as number));
        continue;
      }
      if (!/^[0-9a-f]{1,4}$/.test(raw)) return null;
      groups.push(Number.parseInt(raw, 16));
    }
    return groups;
  };

  const left = groupsIn(halves[0]);
  const right = halves.length === 2 ? groupsIn(halves[1]) : [];
  if (left === null || right === null) return null;

  // Uncompressed carries all eight; `::` stands for at least one omitted group.
  if (halves.length === 1) return left.length === 8 ? left : null;
  const omitted = 8 - left.length - right.length;
  return omitted < 1 ? null : [...left, ...Array<number>(omitted).fill(0), ...right];
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
    const groups = expandIpv6(lower);
    if (groups === null) return "invalid";

    const first = groups[0] as number;
    const isLoopback = groups.every((group, index) => (index === 7 ? group === 1 : group === 0));
    // Ranges, not text prefixes: `fc00::/7` is fc00–fdff and `fe80::/10` is
    // fe80–febf, so `fe90::1` is link-local while `fec0::1` is not.
    const isUniqueLocal = first >= 0xfc00 && first <= 0xfdff;
    const isLinkLocal = first >= 0xfe80 && first <= 0xfebf;
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
