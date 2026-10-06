# 309 — Resolving the client IP behind Railway: decisions

Implementation notes for #309. `skills/bug-workflow.md` asks for one of these
only when the fix involved a real tradeoff. This one qualifies on two of the
three grounds it names: several valid remediations, and **a root cause that
surprised the investigation** — twice.

It also exists because writing it earlier would have been cheaper than not.
Three PRs (#311, #312) were spent arriving at a four-line configuration, and
most of what they cost was rediscovering things that were already known by the
end of the previous one.

## What the issue asked for was impossible

#309 proposed `advanced.ipAddress.trustedProxies`, on the reading that
better-auth needed to be told which hops to skip. Two measurements killed it.

**First, `ipAddressHeaders` was already right.** better-auth 1.7.3 defaults it:

```js
const DEFAULT_IP_HEADERS = ["x-forwarded-for"];
```

So the option the issue named would have changed nothing. The refusal is one
function further down, in `getIPFromHeader`, and it is about the *number* of
entries rather than the header:

```js
if (forwardedIps.length !== 1) return null;   // reached only when trustedProxies is empty
```

**Second, `trustedProxies` has nothing to name here.** It walks the chain right
to left and returns the first hop it does not trust, so making it work requires
recognising the infrastructure hop. Staging reports:

```json
{ "entries": 2, "hops": ["public", "public"] }
```

Both public. There is no private or carrier-grade range to match, and entries
must be literal addresses or CIDRs — Railway publishes neither and promises no
stability, so any value written here would rot silently into the shared bucket
it was meant to fix.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Which header carries the client | `x-real-ip`, alone | The only candidate a sentinel proved the edge overwrites. Single-value, which is the form better-auth resolves unaided. |
| Whether `x-envoy-external-address` belongs there | No — and it shipped there for one release | Railway fronts applications with Envoy, so it looked like the more specific choice, and the review argued it was the safer one. Both were reasoning from plausibility. The sentinel says Railway never sets it and passes a client's through. |
| Whether `x-forwarded-for` belongs in that list, last | No | Same rule, and the same asymmetry. Reading its leftmost entry is safe only while the edge strips what a client sends; measured today, it does — but a fallback whose failure mode is worse than the status quo is not a fallback. |
| Constant or configuration | `AUTH_CLIENT_IP_HEADERS` and `AUTH_TRUSTED_PROXIES`, both from the environment | The header choice rests on a platform behaviour nobody controls. As configuration, a wrong answer is a Railway variable; as a constant it is a release. Standing instruction: decide now in a way that can be changed once it can be measured. |
| `trustedProxies` when unset | Omitted from the object, not passed as `[]` | better-auth's chain mode does not engage for an empty array anyway, so the two behave identically — but an absent option says "nothing is trusted" where an empty one says "nothing in particular", and only one of those is readable a year from now. |
| What the diagnostic reports | Counts, classifications and indices — never an address | `/api/health` is public. The shape is enough to pick a configuration, and a test asserts the response body does not contain an address it was given. |

## The measurement that mattered most, and why it took two rounds

The plan after #311 was to read the forwarding shape and write `trustedProxies`
from it. That plan failed because a *shape* cannot produce a literal address, and
the diagnostic refuses to report one.

So #312 first extended the diagnostic again — a second instrument rather than a
fix. **That was the wrong call**, and Miikka said so: the question it was built to
answer (is `x-real-ip` client-controllable?) is answerable *after* deploying the
configuration, by probing the running service. The configuration went into the
same PR in the end.

The lesson is narrow and worth keeping: an instrument is worth a deployment only
when the thing it measures cannot be observed once the fix is live. Here it could.

## The surprise that reframed the whole issue

Forging `x-forwarded-for` against staging four ways — one entry, two entries, a
private address, and a bare `x-real-ip` — produced an identical two-hop chain
every time. **Railway's edge replaces the header rather than appending to it.**

Two forged entries would have arrived as four. This is a stronger guarantee than
#309 assumed, and it also disproves a comment #311 had already shipped saying
Railway appends — an unmeasured claim, written into a file, three hours before
anything measured it.

## The correction, and the rule that came out of it

The first configuration shipped `["x-envoy-external-address", "x-real-ip"]`; review
argued `x-real-ip` was the risk and it was dropped; the sentinel probe then showed
the exact inverse. Sending `192.0.2.1` (TEST-NET-1, nobody's real source) as each
candidate:

| sent as | result | verdict |
|---|---|---|
| `x-real-ip` | overwritten by the edge, matching forwarded entry 0 | trustworthy |
| `x-envoy-external-address` | arrived intact | client-controlled |
| `cf-connecting-ip`, `true-client-ip` | arrived intact | client-controlled |

**An absent header a client may set is worse than no configuration at all.**
Ordinary visitors resolve nothing and keep sharing a bucket, while an attacker
sets the header and gets a fresh one per request. That is what was live on
staging for one deploy.

The rule worth keeping is one line, and it is not about Envoy or Railway:

> List a header only where a sentinel has come back **overwritten**. Plausible
> provenance is not measured provenance.

Everyone in the loop — the issue, the first configuration, and the review that
corrected it — reasoned from what the platform *ought* to send. The probe took
about a minute.

## Verifying it, which no test can do

The two remaining acceptance criteria are observations, not assertions: the boot
warning is gone, and a sentinel `x-real-ip` from TEST-NET-1 does not survive to
the application. `docs/setup/021-production-environment.md` carries the `curl`
for both, because the person who needs it is an operator rather than a reader of
this file.

Agreement between a header and the forwarded chain is **not** provenance — a
client setting the header to their own address agrees for the same reason the
edge would. Only the sentinel distinguishes them. Sourcery found that claim
stated as fact in a doc comment, and it was right.

That same distinction is why `x-real-ip` came back out of the default list. The
principle is one line: **read a header only where the edge is known to overwrite
it**, and "known" means a sentinel came back overwritten, not that the header
looked plausible.

## Moved from comments, 2026-10-06

Cut from `src/lib/auth.ts` at `a86c1cb` by #531.

- **Why the address headers are configuration.** better-auth resolves an IP
  from a single-value header on its own, but from `x-forwarded-for` only when
  `trustedProxies` names the hops to skip. Behind Railway that header arrives
  with two entries, so without help every visitor shares one rate-limit bucket
  and one attacker locks everyone out. Measured on staging: the edge replaces
  `x-forwarded-for`, it does not append, and sets `x-real-ip` beside it.
- **The rule: read a header only where the edge is measured to overwrite it.**
  A header the platform passes through is not a client address, it is a
  request body. Trusting one lets an attacker rotate it for a fresh bucket per
  request, worse than the shared bucket, where they at least share the limit.
- **The measurement.** `192.0.2.1` (TEST-NET-1) was sent as each candidate and
  `/api/health?forwarded=1` read: `x-real-ip` was overwritten by the edge,
  matching forwarded entry 0; `x-envoy-external-address`, `cf-connecting-ip`
  and `true-client-ip` arrived intact. So `x-real-ip` is the only default.
  `x-envoy-external-address` was the default for one release, on the reasoning
  that Railway fronts applications with Envoy; it does, but does not forward
  that header, and an absent header a client may set is the worst case.
- **Why both are read from the environment.** If a platform turns out to pass
  a client-supplied `x-real-ip` through, the correction is a Railway variable
  and not a release.
- **`advanced.ipAddress`.** Without it every request resolves to no IP and
  better-auth falls back to one shared per-path bucket, the warning in the
  logs since the first production deploy. `trustedProxies` is passed only
  when set: an empty array leaves chain mode disabled anyway, and an absent
  option says more plainly that nothing is trusted.

Cut from `src/lib/forwarding.ts` at `a86c1cb` by #531.

- **Why `forwarding.ts` reports a shape and not the addresses.** better-auth
  refuses to resolve a client IP from `x-forwarded-for` unless the header holds
  exactly one entry or `trustedProxies` says which hops to skip, so choosing
  the configuration needs to know how many hops arrive and of what kind. The
  addresses would answer that too, but `/api/health` is public.
- **Why it also compares the single-value headers.** The first round measured
  two hops on Railway, both public, so there is no infrastructure hop to
  recognise by its range and nothing to put in `trustedProxies`, which takes
  literal addresses this never reports. That leaves the single-value headers,
  which better-auth resolves with no proxy list. Whether one can be trusted
  comes down to two things, both answered by an index: does it agree with a
  hop the edge wrote, and does a value sent by the client survive to the app.
- **`CandidateShape.matchesEntries`.** Reading agreement as provenance would
  trust a spoofable header: a client who sets it to their own address agrees
  with the chain for the same reason the edge would. The probe sends a
  sentinel the client could not otherwise be, an address from TEST-NET-1
  (`192.0.2.0/24`). Empty: the sentinel survived, so the client sets this
  header and it must not be trusted. Non-empty: it was overwritten by
  something matching a hop the edge wrote, and the indices say which hop it
  names, so nothing has to assume leftmost. Every matching index and not the
  first: a chain may carry one address twice, and `indexOf` would answer `0`
  for `A, B, A` whichever occurrence the platform meant.
- **`CANDIDATE_HEADERS`.** Not only `x-real-ip`: answering the question for one
  header at a time costs a deployment per guess. Railway fronts applications
  with Envoy, hence `x-envoy-external-address`; the two Cloudflare spellings
  are there because a CDN in front of the platform is the other way this
  shape changes.
- **`IPV4_IN_IPV6`, and the expanded form in `parseAddress`.** Calling a mapped
  private address public would put a real proxy hop on the wrong side of the
  decision. The regex catches only the `::ffff:` spelling with a dotted tail,
  and a proxy is free to emit either.
- **`expandIpv6`.** Expanding, not pattern-matching the text, is what makes the
  classification correct: link-local is `fe80::/10`, which spans `fe80`
  through `febf`, and a prefix test on the string reports `fe90::1` as
  public. The dotted tail is what makes `2001:db8::192.0.2.1` valid.
- **`parseAddress`.** Canonical because the comparison is the point: the edge
  may write `::ffff:203.0.113.5` in one header and `203.0.113.5` in another,
  and two spellings of one address must not read as two hops.
- **`isPrivateIpv4`.** A request from the public internet cannot have such a
  source address, so those are the hops `trustedProxies` would skip.
