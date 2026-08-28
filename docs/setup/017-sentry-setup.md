# 017 — Sentry error monitoring

## Goal
Wire Sentry into the Next.js app so runtime exceptions in production are
captured with full stack traces. Axiom handles logs — Sentry handles crashes.

---

## Step 1 — Create a Sentry account and project

1. Go to https://sentry.io and sign up (free tier is sufficient)
2. Create a new project → choose **Next.js**
3. Note the **DSN** shown during setup — you will need it in Step 3

---

## Step 2 — Run the Sentry wizard

The wizard creates all required config files automatically:

```bash
npx @sentry/wizard@latest -i nextjs
```

Accept all defaults. The wizard creates:
- `sentry.client.config.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `instrumentation.ts`
- Updates `next.config.ts` with the Sentry plugin

Commit everything the wizard generates:

```bash
git add .
git commit -m "chore: add Sentry error monitoring"
```

---

## Step 3 — Store the DSN

Never hardcode the DSN. Store it as an environment variable.

In Railway → app service → **Variables** tab, add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SENTRY_DSN` | your DSN from Step 1 |

Add to local `.env`:

```
NEXT_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```

Update `.env.example`:

```
NEXT_PUBLIC_SENTRY_DSN=
```

---

## Step 4 — Confirm the wizard used the env var

Open `sentry.client.config.ts` and confirm the `dsn` field reads from the
environment variable rather than being hardcoded:

```typescript
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  debug: false,
});
```

If the wizard hardcoded the DSN, replace it with `process.env.NEXT_PUBLIC_SENTRY_DSN`.
Apply the same check to `sentry.server.config.ts` and `sentry.edge.config.ts`.

A low `tracesSampleRate` (0.1 = 10%) keeps you within the free tier on a hobby
project while still giving useful performance data.

---

## Step 5 — Verify

Push to main and trigger a Railway deploy. Then go to Sentry → your project
→ **Issues** — it should show a "This is your first event" entry from the
wizard's test event, confirming the integration is working.

---

## Silenced warning — `MaxListenersExceededWarning`

The server used to log this repeatedly, once or more per page load, in dev
and in production alike:

```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 close listeners added to [ServerResponse]. MaxListeners is 10.
```

**It is not ours, it is not a leak, and it was not dev-only.** Measured in
#129, silenced in #174. `src/instrumentation.ts` now raises the limit to 20
for `ServerResponse.prototype` only:

```ts
setMaxListeners(SERVER_RESPONSE_MAX_LISTENERS, ServerResponse.prototype);
```

Every other emitter keeps Node's default of 10, so a genuine listener leak
anywhere else still warns — `tests/unit/instrumentation.test.ts` asserts both
halves of that.

Node's limit is per emitter, not per event name, so this raises the threshold
for every event a `ServerResponse` emits, not only `close`. Node offers no
per-event limit; the cost is that a leak of 11–20 listeners of some other
response event would go unwarned, and past 20 it still warns. Pinned by a test
so the breadth is deliberate rather than incidental.

### How many listeners there are, and where they come from

Measured 2026-08-28 on **Next 16.3.2, @sentry/nextjs 10.70.0, Node 24.16.0**,
with the probe below.

**Peak: 8 `close` listeners on one `ServerResponse` in dev, 7 in production.**
The difference is Next's dev-only request tracing. Contributors:

| Source | |
|---|---|
| Sentry | `recordRequestSession`, and its async-local-storage path |
| Next | `requestHandlerImpl` |
| Next | `createAbortController` / `signalFromNodeResponse` |
| Next | `DevServer` request tracing — **dev only**, absent in production |
| Next | `AfterContext`'s `onClose`, `NodeNextResponse.onClose` |
| Next | `pipeNodeReadableToNodeResponse` |

Count the **peak concurrent** listeners, not the attachments. Those sources
attach 13 times over one response's life, but `once` listeners remove
themselves when they fire, and Node warns on how many are registered at once.
A cumulative tally overstates it by roughly half.

**On this version the warning no longer fires at all.** Verified by reverting
`setMaxListeners` in `src/instrumentation.ts`, clearing `.next`, and loading
four pages with no instrumentation: zero warnings. Next 16.3.0 attached enough
to cross Node's limit of 10; 16.3.2 does not.

`SERVER_RESPONSE_MAX_LISTENERS` is 20, so there is ample headroom over 8. It is
kept rather than removed: the count moved once between patch releases and can
move back, and the constant costs nothing while the warning it prevents costs a
line per request in production logs.

The historical figures from #129 on Next 16.3.0 — 7 from the bundled `httpxy`
proxy, 2 from `requestHandlerImpl`/`createAbortController`, 2 from Sentry,
11 in total — are superseded by the measurement above.


### Why it is safe

The listeners are attached to a single `ServerResponse`, which is discarded
when the request ends. Nothing accumulates across requests. Node's warning
is a fixed threshold on a per-emitter count, not leak detection, so this is
a false positive. It costs log noise, including in production logs shipped
to Axiom, and nothing else.

### Upstream

Reported as [vercel/next.js#97646](https://github.com/vercel/next.js/issues/97646),
which describes exactly this combination — Next 16.3.0+ raising its internal
close-listener count, crossing the limit once an APM SDK is present. It was
**auto-closed for a missing reproduction, not fixed**; the issue text asks
for a new issue to be opened. Related: PR #93158 and discussion #96973, no
fix as of 2026-08.

### Why the limit, and why only here

#129 originally rejected raising the limit, on the grounds that it silences a
symptom and could hide a real leak later. #174 reversed that: the listeners
were measured, the diagnosis has not changed, and a false positive on every
single request costs more than leak detection on one emitter type — it buried
the request log locally and shipped noise to Axiom.

The reversal is narrow. Raising `EventEmitter.defaultMaxListeners` globally, or
running with `--no-warnings`, would have given up leak detection everywhere;
scoping it to `ServerResponse.prototype` gives it up only for HTTP responses,
whose listener count is Next's to decide and which are discarded per request.

### Still deliberately not done

- **Changing Sentry's `tracesSampleRate`** — Sentry is 2 of 11; this would
  not get under the limit and would cost production tracing.
- **Disabling Next's compression or proxying** — the listeners come from
  Next's own request pipeline, not from configuration we should be turning
  off to quiet a log line.

### Re-verifying after an upgrade

Save the script below as `probe.cjs` and preload it into whichever server you
are checking:

```sh
NODE_OPTIONS="--require ./probe.cjs" npm run dev
npm run build && NODE_OPTIONS="--require ./probe.cjs" npm start
```

It prints the highest number of `close` listeners any single response carried,
and which code attached them. Compare that peak against
`SERVER_RESPONSE_MAX_LISTENERS` in `src/instrumentation.ts`:

- **at or below it** — nothing to do; that is the situation today, at 8 of 20 in
  dev and 7 of 20 in production.
- **above it** — the warning is back in production. Raise the constant and
  record the new measurement in the table above.

Node warns only when a listener is added *past* the limit, so a peak of exactly
20 against a limit of 20 is still silent. The threshold to act on is 21.

Two things it must get right, both of which the previous version got wrong and
which are the whole reason this was repaired in #176:

**Patch every attachment method, not just `on`.** Next 16.3.2 adds roughly half
its `close` listeners with `once`. A probe patching `on` alone saw about five of
the eight, never reached its threshold, and printed nothing at all — which reads
exactly like "no problem found".

**Count with Node's own `listenerCount`, not a private tally.** `once`
delegates to `on`, so a probe that patches both and counts each call reports
roughly double. That is how the previous repair attempt produced "13 listeners"
with every stack listed twice.

```js
const { EventEmitter } = require("node:events");

/** Highest number of `close` listeners seen on a single response, and who added them. */
let peak = 0;
const perResponse = new WeakMap();

function caller() {
  return (new Error().stack || "")
    .split("\n")
    .slice(1)
    .filter(
      (line) =>
        !line.includes(__filename) &&
        !line.includes("node:") &&
        // Next's compiled `compression` overrides res.on, so its frame appears
        // for every caller routed through it.
        !line.includes("compiled/compression")
    )
    .map((line) => line.trim().replace(/^at /, ""))[0] ?? "(unknown)";
}

// `once` calls `on` internally, so the guard must span the delegation: without
// it the outer `once` and the inner `on` each record the same listener.
let recording = false;

for (const method of ["on", "addListener", "once", "prependListener", "prependOnceListener"]) {
  const original = EventEmitter.prototype[method];
  if (typeof original !== "function") continue;

  EventEmitter.prototype[method] = function (event, listener) {
    const watching =
      event === "close" && !recording && this?.constructor?.name === "ServerResponse";
    if (!watching) return original.call(this, event, listener);

    recording = true;
    try {
      const before = this.listenerCount("close");
      const result = original.call(this, event, listener);
      const now = this.listenerCount("close");

      // Node's own count, not a tally of our calls.
      if (now > before) {
        const sources = perResponse.get(this) ?? [];
        sources.push(caller());
        perResponse.set(this, sources);

        if (now > peak) {
          peak = now;
          console.error(`--- ${now} close listeners on one ServerResponse ---`);
          sources.forEach((s, i) => console.error(`  ${i + 1}. ${s}`));
        }
      }
      return result;
    } finally {
      recording = false;
    }
  };
}
```

The listed sources can outnumber the peak: `once` listeners remove themselves
when they fire, so a response may attach thirteen over its life while never
holding more than eight at once. The peak is the number Node warns on.

---

## Done when
- [ ] Sentry project created
- [ ] Wizard run and config files committed
- [ ] `NEXT_PUBLIC_SENTRY_DSN` in Railway variables and local `.env`
- [ ] DSN not hardcoded in any config file
- [ ] Test event visible in Sentry dashboard

## Next
→ `018-health-check.md`