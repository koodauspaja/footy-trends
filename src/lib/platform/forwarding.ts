/**
 * The shape of a request's forwarding headers: counts, classifications and
 * indices, never an address. `/api/health` reports it, and it is public.
 *
 * decisions/309-client-ip-resolution.md
 */

export type HopKind = "public" | "private" | "invalid";

/**
 * One single-value client-IP header, as far as it can be described without
 * quoting it.
 *
 * decisions/309-client-ip-resolution.md
 */
export type CandidateShape = {
  /** Whether the value parses as one address. */
  valid: boolean;
  /**
   * Every `x-forwarded-for` entry carrying the same address; empty for none.
   * Agreement is not provenance. Empty under the sentinel probe means the client
   * sets this header.
   */
  matchesEntries: number[];
};

export type ForwardingShape = {
  /** How many comma-separated entries `x-forwarded-for` carried. */
  entries: number;
  /** Each entry classified, in the order sent. */
  hops: HopKind[];
  /**
   * The single-value headers that arrived, by name. `{}` means none did.
   */
  candidates: Record<string, CandidateShape>;
};

/**
 * The single-value headers worth asking about.
 *
 * decisions/309-client-ip-resolution.md
 */
const CANDIDATE_HEADERS = [
  "x-real-ip",
  "x-envoy-external-address",
  "cf-connecting-ip",
  "true-client-ip",
] as const;

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * An IPv4 address in an IPv6 spelling: `::ffff:10.0.0.1` is the private
 * `10.0.0.1`.
 *
 * decisions/309-client-ip-resolution.md
 */
const IPV4_IN_IPV6 = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/;

/**
 * An address parsed into the form both classifying and comparing need.
 *
 * decisions/309-client-ip-resolution.md
 */
type Address =
  | { kind: "ipv4"; text: string; octets: number[] }
  | { kind: "ipv6"; text: string; groups: number[] };

/**
 * The four octets of a dotted quad, or null when it is not one.
 *
 * decisions/309-client-ip-resolution.md
 */
function ipv4Octets(value: string): number[] | null {
  if (!IPV4.test(value)) return null;
  const octets = value.split(".").map(Number);
  return octets.some((octet) => octet > 255) ? null : octets;
}

/**
 * An IPv6 address expanded to its eight 16-bit groups, or null when it is not a
 * valid address. A dotted-decimal tail is allowed in the final position.
 *
 * decisions/309-client-ip-resolution.md
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
        groups.push(
          (octets[0] as number) * 256 + (octets[1] as number),
          (octets[2] as number) * 256 + (octets[3] as number)
        );
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
  return omitted < 1 ? null : [...left, ...new Array<number>(omitted).fill(0), ...right];
}

/**
 * One address in a canonical form, or null when the text is not an address.
 *
 * decisions/309-client-ip-resolution.md
 */
function parseAddress(value: string): Address | null {
  const text = value.trim().toLowerCase();

  const octets = ipv4Octets(text);
  // `octets.join` rather than the text as written: `010.0.0.1` and `10.0.0.1`
  // are one address, and comparing the spelling would report two.
  if (octets !== null) return { kind: "ipv4", text: octets.join("."), octets };
  // Rejected here rather than falling through: a dotted quad with an octet past
  // 255 is not an address, and it is not IPv6 either.
  if (IPV4.test(text)) return null;

  if (!text.includes(":")) return null;

  const embedded = IPV4_IN_IPV6.exec(text)?.[1];
  if (embedded !== undefined) {
    const mapped = ipv4Octets(embedded);
    // `mapped.join` for the same reason as the plain dotted quad above:
    // `::ffff:010.000.000.001` and `10.0.0.1` are one address.
    return mapped === null ? null : { kind: "ipv4", text: mapped.join("."), octets: mapped };
  }

  // Validated rather than assumed from the presence of a colon: `not:an:address`
  // was being reported as a public hop, which is the answer most likely to be
  // acted on and the one hardest to notice is wrong.
  const groups = expandIpv6(text);
  if (groups === null) return null;

  // The same IPv4-mapped address, expanded: `0:0:0:0:0:ffff:cb00:7105` is
  // `203.0.113.5`.
  const isIpv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  if (isIpv4Mapped) {
    const high = groups[6] as number;
    const low = groups[7] as number;
    const mapped = [high >> 8, high & 0xff, low >> 8, low & 0xff];
    return { kind: "ipv4", text: mapped.join("."), octets: mapped };
  }

  return {
    kind: "ipv6",
    text: groups.map((group) => group.toString(16).padStart(4, "0")).join(":"),
    groups,
  };
}

/**
 * Private, loopback, link-local and carrier-grade NAT ranges: a hop inside one
 * is infrastructure, not a reader.
 *
 * decisions/309-client-ip-resolution.md
 */
function isPrivateIpv4(octets: number[]): boolean {
  const first = octets[0] as number;
  const second = octets[1] as number;

  if (first === 10 || first === 127) return true;
  if (first === 192 && second === 168) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 169 && second === 254) return true;
  // 100.64.0.0/10 — carrier-grade NAT, which is what container platforms
  // commonly use between their edge and an application.
  return first === 100 && second >= 64 && second <= 127;
}

function isPrivateIpv6(groups: number[]): boolean {
  const first = groups[0] as number;
  const isLoopback = groups.every((group, index) => (index === 7 ? group === 1 : group === 0));
  // Ranges, not text prefixes: `fc00::/7` is fc00–fdff and `fe80::/10` is
  // fe80–febf, so `fe90::1` is link-local while `fec0::1` is not.
  const isUniqueLocal = first >= 0xfc00 && first <= 0xfdff;
  const isLinkLocal = first >= 0xfe80 && first <= 0xfebf;
  return isLoopback || isUniqueLocal || isLinkLocal;
}

function classify(entry: string): HopKind {
  // No empty-string guard: `forwardingShape` filters those out before calling
  // this, and an empty value falls through to "invalid" anyway. A branch that
  // cannot be taken reads as a handled case rather than an impossible one.
  const address = parseAddress(entry);
  if (address === null) return "invalid";

  const isPrivate =
    address.kind === "ipv4" ? isPrivateIpv4(address.octets) : isPrivateIpv6(address.groups);
  return isPrivate ? "private" : "public";
}

/**
 * Reads the forwarding headers without recording a single address.
 *
 * decisions/309-client-ip-resolution.md
 */
export function forwardingShape(headers: Headers): ForwardingShape {
  const forwardedFor = headers.get("x-forwarded-for");
  const entries =
    forwardedFor === null ? [] : forwardedFor.split(",").filter((part) => part.trim() !== "");
  const hopAddresses = entries.map((entry) => parseAddress(entry)?.text ?? null);

  const candidates: Record<string, CandidateShape> = {};
  for (const name of CANDIDATE_HEADERS) {
    const value = headers.get(name);
    if (value === null) continue;

    const address = parseAddress(value);
    // Compared on the parsed text, so a header that failed to parse cannot
    // match a hop that also failed to parse — two nulls are not one address.
    const matchesEntries =
      address === null
        ? []
        : hopAddresses.flatMap((hop, index) => (hop === address.text ? [index] : []));
    candidates[name] = { valid: address !== null, matchesEntries };
  }

  return {
    entries: entries.length,
    hops: entries.map(classify),
    candidates,
  };
}
