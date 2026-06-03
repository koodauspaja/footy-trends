import { sql } from "drizzle-orm";
import { db } from "@/db";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

function toLogError(error: unknown) {
  return {
    err: error instanceof Error ? error : { error },
  };
}

export async function GET() {
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

  return Response.json(
    {
      status: healthy ? "ok" : "error",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 }
  );
}
