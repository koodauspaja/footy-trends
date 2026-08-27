import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { getCurrentSeason } from "@/lib/taso";

export const dynamic = "force-dynamic";

/** Long enough for a healthy provider, short enough that a probe never waits on a stall. */
const PROVIDER_TIMEOUT_MS = 3000;

function toLogError(error: unknown) {
  return {
    err: error instanceof Error ? error : { error },
  };
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const checks: Record<string, "ok" | "error"> = {};
  let healthy = true;

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = "ok";
  } catch (error: unknown) {
    checks.database = "error";
    healthy = false;
    logger.error(toLogError(error), "Database health check failed");
  }

  try {
    await redis.ping();
    checks.redis = "ok";
  } catch (error: unknown) {
    checks.redis = "error";
    // Redis failure is non-fatal: the app can serve requests without cache.
    logger.warn(toLogError(error), "Redis health check failed");
  }

  // Opt-in, not on by default. A platform probe hits this endpoint constantly,
  // and the project's own rule is that provider responses are cached and never
  // fetched per request — so making every probe call TASO would be the very
  // thing the rule forbids. A human debugging "every page works but one" asks
  // for it explicitly with `?providers=1`. See #182.
  if (new URL(request.url).searchParams.has("providers")) {
    try {
      // A real request, not a ping: TASO sits behind Cloudflare and needs an
      // API key plus Referer/Origin/User-Agent, so only a genuine call proves
      // the path. `getCurrentSeason` asks which seasons it publishes, so
      // nothing here has to name a competition and guess wrong in January.
      //
      // Bounded, because a health endpoint that hangs until the probe times
      // out is worse than one reporting a provider as unreachable.
      await getCurrentSeason(AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
      checks.taso = "ok";
    } catch (error: unknown) {
      checks.taso = "error";
      // Non-fatal, like Redis: pages backed by stored rows keep serving, and a
      // provider outage must not make the service look down to a probe.
      logger.warn(toLogError(error), "TASO health check failed");
    }
  }

  const status = healthy ? 200 : 503;
  logger.info(
    { method: "GET", path: "/api/health", status, durationMs: Date.now() - startedAt, checks },
    "API request completed"
  );

  return Response.json(
    {
      status: healthy ? "ok" : "error",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
