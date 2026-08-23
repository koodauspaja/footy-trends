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

## Known warning — `MaxListenersExceededWarning`

The server logs this repeatedly, once or more per page load:

```
MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
11 close listeners added to [ServerResponse]. MaxListeners is 10.
```

**It is not ours, it is not a leak, and it is not dev-only.** Documented
here so it is not re-investigated — see #129.

### Where the 11 listeners come from

Measured by preloading a probe that patches `EventEmitter.prototype.on` and
dumps a stack for every `close` listener attached to a `ServerResponse`.
Identical in `npm run dev` and in a production `npm run build && npm start`:

| Listeners | Source |
|---|---|
| 7 | Next's bundled `httpxy` proxy — `server/lib/router-utils/proxy-request.js` and `compiled/httpxy` |
| 2 | Next's `requestHandlerImpl` and `createAbortController`/`signalFromNodeResponse` |
| 2 | Sentry — `recordRequestSession` and its async-local-storage path |

So Next accounts for 9 of the 11 and Sentry for 2. Removing Sentry would
drop the total to 9 and silence the warning, but Sentry is not the cause —
Next alone sits one under Node's default limit of 10.

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

### Deliberately not done

- **Raising `setMaxListeners`** — silences the symptom without addressing
  the cause, and would hide a genuine listener leak later.
- **Changing Sentry's `tracesSampleRate`** — Sentry is 2 of 11; this would
  not get under the limit and would cost production tracing.
- **Disabling Next's compression or proxying** — the listeners come from
  Next's own request pipeline, not from configuration we should be turning
  off to quiet a log line.

### Re-verifying

If the counts change after a Next or Sentry upgrade, re-measure rather than
assume. Save the script below as `probe.cjs` and preload it into whichever
server you are checking — the warning appears in both:

```sh
NODE_OPTIONS="--require ./probe.cjs" npm run dev
npm run build && NODE_OPTIONS="--require ./probe.cjs" npm start
```

The probe dumps once a single response crosses Node's own limit, so **no
output means the warning is gone** — the listener count has dropped to the
limit or below and there is nothing left to investigate.

```js
const { EventEmitter } = require("node:events");
const tracked = new WeakMap();
const original = EventEmitter.prototype.on;
// Node warns one past its own limit; derived rather than hardcoded to 11 so
// the probe stays correct if defaultMaxListeners ever changes.
const threshold = EventEmitter.defaultMaxListeners + 1;

EventEmitter.prototype.on = EventEmitter.prototype.addListener = function (event, listener) {
  if (event === "close" && this?.constructor?.name === "ServerResponse") {
    let stacks = tracked.get(this) ?? [];
    tracked.set(this, stacks);
    // Frames are filtered: the probe's own, node internals, and Next's
    // compiled `compression`, which overrides res.on and would otherwise
    // appear as the caller for every listener routed through it.
    stacks.push(new Error().stack.split("\n").slice(1)
      .filter((l) => !l.includes(__filename) && !l.includes("node:events"))
      // Next's compiled `compression` overrides res.on, so its frame appears
      // for every caller routed through it — see the comment above.
      .filter((l) => !l.includes("compiled/compression"))
      .map((l) => l.trim().replace(/^at /, ""))
      .slice(0, 2).join(" <- "));
    // Dump once per response, at the threshold, listing every listener so far.
    if (stacks.length === threshold) {
      console.error(`--- ${threshold} close listeners on one ServerResponse ---`);
      stacks.forEach((s, i) => console.error(`  ${i + 1}. ${s}`));
    }
  }
  return original.call(this, event, listener);
};
```

---

## Done when
- [ ] Sentry project created
- [ ] Wizard run and config files committed
- [ ] `NEXT_PUBLIC_SENTRY_DSN` in Railway variables and local `.env`
- [ ] DSN not hardcoded in any config file
- [ ] Test event visible in Sentry dashboard

## Next
→ `018-health-check.md`