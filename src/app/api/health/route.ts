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

/**
 * The commit actually serving this response, so "which version is in
 * production?" is a request rather than dashboard archaeology. Railway sets it
 * per deployment; locally and in tests there is no deployment behind it, and
 * `null` is the honest answer rather than a guess.
 *
 * Blank counts as absent. `?? null` alone would report `""` for a variable that
 * exists but is empty, which reads as "the commit is the empty string" rather
 * than "unknown" — and a probe cannot tell those apart.
 *
 * The commit rather than a version string: the tag is derived from it
 * (`git tag --points-at`), so the two cannot drift the way a hand-maintained
 * version would. See skills/release.md.
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
      const season = await getCurrentSeason(AbortSignal.timeout(PROVIDER_TIMEOUT_MS));

      // A throw is not the only way this fails. A stale key is blocked by
      // Cloudflare with a 403, which throws — but TASO's own API answers a bad
      // request with **HTTP 200** and an error body, which parses fine and
      // yields no recognisable seasons. `getCurrentSeason` returns `null` for
      // that, and awaiting it without looking reported the provider healthy on
      // a response that contained no data at all (#113).
      //
      // Either way there is nothing usable behind the key, which is what the
      // probe is being asked about.
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
      timestamp: new Date().toISOString(),
    },
    { status }
  );
}
