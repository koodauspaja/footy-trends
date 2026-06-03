# 016 — Redis cache setup

## Goal
Add a Redis service to the Railway project and create a thin cache utility
that every feature can use to store API responses. This is what enforces the
caching rule in `REVIEW_RULES.md` at the code level.

---

## Step 1 — Add Redis in Railway

1. Go to Railway → your `footy-trends` project
2. Click **+ New** → **Database** → **Add Redis**
3. Railway provisions the Redis instance
4. Wire it into the app service variables:
  - App service → **Variables** → **+ New Variable**
  - Name: `REDIS_URL`
  - Value: `${{Redis.REDIS_URL}}`
5. Confirm `REDIS_URL` appears in the app service → **Variables** tab

---

## Step 2 — Update `.env` for local development

Add to your local `.env`:

```
REDIS_URL=redis://localhost:6379
```

Start local dependencies with Docker Compose (recommended, matches the Postgres setup):

```bash
docker compose up -d
```

If you want to start only Redis:

```bash
docker compose up -d redis
```

As a one-off alternative, you can run Redis via Docker directly:

```bash
docker run -d -p 6379:6379 redis:alpine
```

Or install it directly:

```bash
brew install redis && brew services start redis   # macOS
```

---

## Step 3 — Install the Redis client

```bash
npm install ioredis
npm install --save-dev @types/ioredis
```

---

## Step 4 — Create the Redis client singleton

Next.js hot-reloads modules in development, which would create a new Redis
connection on every reload without a singleton pattern.

Create file: `src/lib/redis.ts`

```typescript
import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis | undefined };

export const redis =
  globalForRedis.redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
```

---

## Step 5 — Create the cache utility

This is the function every feature should use for caching API responses.

Create file: `src/lib/cache.ts`

```typescript
import { redis } from "./redis";

export async function getCached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);

  if (cached !== null) {
    return JSON.parse(cached) as T;
  }

  const fresh = await fetcher();
  await redis.setex(key, ttlSeconds, JSON.stringify(fresh));
  return fresh;
}

export async function invalidateCache(key: string): Promise<void> {
  await redis.del(key);
}
```

Usage in a feature:

```typescript
const standings = await getCached(
  "standings:PL:2024",
  60 * 60, // 1 hour TTL
  () => fetchStandingsFromApi("PL", 2024)
);
```

Cache keys should follow the pattern `resource:competition:season` so they are
predictable and easy to invalidate selectively.

---

## Step 6 — Commit

```bash
git add src/lib/redis.ts src/lib/cache.ts
git commit -m "chore: add Redis client and cache utility"
git push origin main
```

---

## Done when
- [ ] Redis service provisioned in Railway
- [ ] `REDIS_URL` visible in app service variables
- [ ] `REDIS_URL` added to local `.env`
- [ ] Local Docker Compose starts Redis on port 6379
- [ ] `ioredis` installed
- [ ] `src/lib/redis.ts` and `src/lib/cache.ts` committed
- [ ] `getCached` tested locally with a dummy call

## Next
→ `017-sentry-setup.md`