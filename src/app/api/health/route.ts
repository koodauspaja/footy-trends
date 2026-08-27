import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { getCurrentSeason } from "@/lib/taso";

export const dynamic = "force-dynamic";

function toLogError(error: unknown) {
  return {
    err: error instanceof Error ? error : { error },
  };
}

export async function GET() {
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

  try {
    // A real request to the provider, not a ping: TASO sits behind Cloudflare
    // and requires an API key plus Referer/Origin/User-Agent, so only a
    // genuine call proves the whole path works.
    //
    // `getCurrentSeason` asks TASO which seasons it publishes, so nothing here
    // has to name a competition. Deriving one from the calendar year would
    // report a false failure every January, between the year turning over and
    // TASO publishing that season.
    await getCurrentSeason();
    checks.taso = "ok";
  } catch (error: unknown) {
    checks.taso = "error";
    // Non-fatal for the same reason as Redis: pages with stored rows still
    // serve. Reported so "every page is fine but one is broken" is answerable
    // from here rather than by probing pages one at a time — see #182.
    logger.warn(toLogError(error), "TASO health check failed");
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
