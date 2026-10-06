/**
 * The health endpoint: the database and Redis on every call, TASO and the
 * shape of the forwarded headers only when asked.
 *
 * decisions/017-huuhkajat.md
 * decisions/085-running-commit-at-health.md
 * decisions/113-taso-key-monitor.md
 * decisions/309-client-ip-resolution.md
 */

import { sql } from "drizzle-orm";
import { db } from "@/db";
import { forwardingShape } from "@/lib/forwarding";
import { logger } from "@/lib/logger";
import { redis } from "@/lib/redis";
import { getCurrentSeason } from "@/lib/taso";

export const dynamic = "force-dynamic";

/**
 * Long enough for a healthy provider, short enough that a probe never waits on a stall.
 *
 * decisions/017-huuhkajat.md
 */
const PROVIDER_TIMEOUT_MS = 3000;

function toLogError(error: unknown) {
  return {
    err: error instanceof Error ? error : { error },
  };
}

/**
 * The commit serving this response, as Railway sets it per deployment. Null
 * locally and in tests, and when the variable is blank.
 *
 * decisions/085-running-commit-at-health.md
 */
function deployedCommit(): string | null {
  const sha = process.env.RAILWAY_GIT_COMMIT_SHA?.trim();
  return sha === undefined || sha === "" ? null : sha;
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

  // Opt-in with `?providers=1`: a platform probe hits this endpoint constantly,
  // and provider responses are never fetched per request.
  if (new URL(request.url).searchParams.has("providers")) {
    try {
      // A real request, not a ping: only a genuine call proves the key and headers.
      // Bounded, so the endpoint cannot hang until the probe times out.
      const season = await getCurrentSeason(AbortSignal.timeout(PROVIDER_TIMEOUT_MS));

      // A throw is not the only failure: TASO answers a bad request with HTTP 200
      // and an error body, for which `getCurrentSeason` returns `null`.
      checks.taso = season === null ? "error" : "ok";
      if (season === null) {
        logger.warn(
          { season },
          "TASO health check answered without a recognisable published season"
        );
      }
    } catch (error: unknown) {
      checks.taso = "error";
      // Non-fatal, like Redis: pages backed by stored rows keep serving, and a
      // provider outage must not make the service look down to a probe.
      logger.warn(toLogError(error), "TASO health check failed");
    }
  }

  // Opt-in with `?forwarded`, like the providers above. Counts, classifications
  // and indices only: this endpoint is public, so it never reports an address.
  const forwarding = new URL(request.url).searchParams.has("forwarded")
    ? forwardingShape(request.headers)
    : undefined;

  const status = healthy ? 200 : 503;
  logger.info(
    { method: "GET", path: "/api/health", status, durationMs: Date.now() - startedAt, checks },
    "API request completed"
  );

  return Response.json(
    {
      status: healthy ? "ok" : "error",
      checks,
      commit: deployedCommit(),
      ...(forwarding === undefined ? {} : { forwarding }),
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
