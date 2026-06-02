# 018 — Health check endpoint

## Goal
Add a `/api/health` endpoint that verifies the database and Redis connections
are live. Railway uses it to confirm a deploy succeeded before routing traffic,
and you can hit it any time to check the app is healthy.

---

## Step 1 — Create the endpoint

Create file: `src/app/api/health/route.ts`

```typescript
import { db } from "@/db";
import { redis } from "@/lib/redis";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | "error"> = {};
  let healthy = true;

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
    healthy = false;
  }

  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "error";
    // Redis failure is non-fatal — the app can serve requests without the
    // cache, just slower and at risk of hitting the football-data.org rate limit.
    // Do not mark healthy = false here.
  }

  return Response.json(
    {
      status: healthy ? "ok" : "error",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
```

Database failure returns 503 — the app cannot function without it.
Redis failure returns 200 with a note — the app degrades gracefully without cache.

---

## Step 2 — Configure Railway to use it

1. Go to Railway → project → app service → **Settings** → **Deploy**
2. Under **Health check path**, set: `/api/health`
3. Save — Railway will now hit this endpoint after each deploy and only
   mark it successful if it returns 200

---

## Step 3 — Commit

```bash
git add src/app/api/health/route.ts
git commit -m "chore: add health check endpoint"
git push origin main
```

---

## Step 4 — Verify

Once deployed, hit the endpoint directly:

```bash
curl https://YOUR-RAILWAY-URL/api/health
```

Expected response:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "timestamp": "2025-06-01T12:00:00.000Z"
}
```

---

## Done when
- [ ] `src/app/api/health/route.ts` committed
- [ ] Railway health check path set to `/api/health`
- [ ] Endpoint returns 200 with both checks passing after deploy

## Next
→ `019-railway-config.md`