import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { customSession } from "better-auth/plugins/custom-session";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { displayNameFor } from "@/lib/auth-profile";
import { getSessionExtrasFor } from "@/lib/preferences";
import { redisRateLimitStorage } from "@/lib/rate-limit-storage";
import { signInRefusal } from "@/lib/sign-in-allowlist";

/**
 * Reads a variable that sign-in cannot work without, and says which one is
 * missing rather than failing later inside the OAuth flow.
 *
 * The failure this prevents is specific: with no secret, better-auth still
 * constructs, the header still renders, and the break only appears when someone
 * clicks `Kirjaudu sisään` in production. See specs/023-google-oauth-login.md.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for authentication but is not set`);
  }
  return value;
}

/**
 * Which headers carry the client's address, and which hops to skip, from #309.
 *
 * **Why this is configuration and not a constant.** better-auth resolves an IP
 * from a *single-value* header on its own, but from `x-forwarded-for` only when
 * `trustedProxies` names the hops to skip — and behind Railway that header
 * arrives with two entries, so without help every visitor shares one rate-limit
 * bucket and one attacker locks everyone out. Measured on staging: the edge
 * *replaces* `x-forwarded-for` rather than appending, and sets `x-real-ip`
 * alongside it.
 *
 * **The rule: read a header only where the edge is measured to overwrite it.**
 * A header the platform passes through is not a client address, it is a request
 * body — and trusting one lets an attacker rotate it for a fresh bucket per
 * request, which is worse than the shared bucket this replaces, where they at
 * least share the limit with everyone.
 *
 * Measured on staging by sending `192.0.2.1` (TEST-NET-1, nobody's real source)
 * as each candidate and reading `/api/health?forwarded=1`:
 *
 * | sent as | result |
 * |---|---|
 * | `x-real-ip` | overwritten by the edge, matching forwarded entry 0 |
 * | `x-envoy-external-address` | **arrived intact** — Railway never sets it |
 * | `cf-connecting-ip`, `true-client-ip` | arrived intact |
 *
 * So `x-real-ip` is the only default. `x-envoy-external-address` was the default
 * for one release on the reasoning that Railway fronts applications with Envoy;
 * it does, but it does not forward that header, and an absent header that a
 * client may set is the worst of the three cases — nothing resolves for ordinary
 * visitors, and an attacker resolves whatever they like.
 *
 * Reading both from the environment is what makes that reversible: if a platform turns out to pass a client-supplied
 * `x-real-ip` through, the correction is a Railway variable rather than a
 * release. `/api/health?forwarded=1` reports which header agrees with the chain,
 * which is how that gets checked rather than assumed.
 */
function headerList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
}

const DEFAULT_CLIENT_IP_HEADERS = ["x-real-ip"];

/**
 * The better-auth server instance, from specs/023-google-oauth-login.md.
 *
 * Google is the only provider, sessions live in Postgres, and nothing in the
 * app gates on a session yet — this exists so that #117 and favourite teams
 * have a real user to attach to.
 */
export const auth = betterAuth({
  secret: required("BETTER_AUTH_SECRET"),
  baseURL: required("BETTER_AUTH_URL"),

  /**
   * Without this every request resolves to no IP at all, and better-auth falls
   * back to one shared per-path bucket — the warning in the logs since the
   * first production deploy (#309).
   *
   * `trustedProxies` is passed only when it is set: an empty array would leave
   * better-auth's chain mode disabled anyway, and an absent option says more
   * plainly that nothing is being trusted.
   */
  advanced: {
    ipAddress: (() => {
      const configured = headerList("AUTH_CLIENT_IP_HEADERS");
      const trustedProxies = headerList("AUTH_TRUSTED_PROXIES");

      return {
        ipAddressHeaders: configured.length > 0 ? configured : DEFAULT_CLIENT_IP_HEADERS,
        ...(trustedProxies.length > 0 ? { trustedProxies } : {}),
      };
    })(),
  },

  /**
   * Counters in Redis rather than in one instance's memory (#318).
   *
   * better-auth's default is an in-process `Map`: it resets on every deploy,
   * and it would become one limiter per instance the moment the service ran
   * two, multiplying the effective limit with nothing reporting that it had.
   *
   * `customStorage` and not `secondaryStorage`, which is the documented option
   * for this: configuring that one also moves **sessions** into Redis, and
   * sign-in would then need Redis to be up. This moves the counters alone.
   */
  rateLimit: {
    customStorage: redisRateLimitStorage(),
  },

  database: drizzleAdapter(db, {
    provider: "pg",
    // The model names better-auth asks for, mapped to our tables. Passed
    // explicitly rather than relying on `usePlural`, because these are the
    // library's singular defaults and the mapping should be visible.
    schema: { user, session, account, verification },
  }),

  socialProviders: {
    google: {
      clientId: required("GOOGLE_CLIENT_ID"),
      clientSecret: required("GOOGLE_CLIENT_SECRET"),
      // Guards a `NOT NULL` column against a profile with no name — see
      // auth-profile.ts for why that is worth guarding at all.
      mapProfileToUser: (profile) => ({ name: displayNameFor(profile) }),
    },
  },

  user: {
    /**
     * Who may sign in at all, where an environment says so (#314).
     *
     * **This hook and not `databaseHooks.user.create.before`.** That one fires
     * only when an account is created, so anyone who signed in before a list
     * existed would keep their access forever. `validateUserInfo` runs before
     * `create-user`, on `link-account`, and on every OAuth `sign-in` — read
     * from better-auth 1.7.3's source rather than its documentation, where
     * `link-account.mjs` passes `action: "sign-in"` for an account that already
     * exists.
     *
     * Running before `create-user` is what keeps a refused attempt from leaving
     * a `user` row behind, which #314 asks for explicitly.
     *
     * Returning `{ error }` becomes a `403` that the OAuth callback turns into
     * a redirect carrying `error=<code>`; `auth-controls.tsx` renders the
     * Finnish for it. The code is deliberately not the reason — see
     * `sign-in-refusal.ts`.
     */
    validateUserInfo: ({ user }) => signInRefusal(user.email),

    /**
     * Off by default in better-auth. Enabled for the settings page's
     * `Poista tili`, from specs/024-account-settings.md.
     *
     * No `sendDeleteAccountVerification`, so deletion happens immediately. The
     * email round trip would add friction without safety: the session already
     * proves the account, and the page requires the reader to type `POISTA`
     * before the button enables.
     */
    deleteUser: { enabled: true },
  },

  session: {
    /**
     * Database sessions, deliberately: signing out revokes immediately.
     *
     * better-auth's cookie cache would remove the per-request lookup by
     * carrying the session in a signed cookie for a TTL — and would reintroduce
     * exactly the revocation delay database sessions were chosen to avoid. It
     * stays off until something measures the lookup as a problem.
     */
    cookieCache: { enabled: false },
  },

  plugins: [
    /**
     * Puts the reader's start-page preference on the session the browser
     * already fetches, from specs/024-account-settings.md.
     *
     * `/` is prerendered and applies the region preference client-side, so it
     * needs the value in the browser. Enriching `/api/auth/get-session` costs
     * no extra round trip, where a second client fetch would.
     *
     * Only what the client acts on: the start-page preference, whether there
     * is a custom avatar to ask for (specs/025-custom-avatar.md), and the
     * reader's favourites (specs/026-favourites.md). The settings page reads
     * the rest server-side, so shipping it here would be payload on every page
     * load for nothing.
     *
     * The favourites are here for a reason the others are not: the toggle
     * renders on the region picker, which lives on the four prerendered pages,
     * so it cannot read a session on the server at all.
     *
     * **The cost, since this runs on every `/api/auth/get-session`.** The region
     * and the avatar version come from one query, a left join from `user`. The
     * favourites are two more, in parallel, because they are one-to-many and
     * joining them onto that row would multiply it out. Measured with both caps
     * filled: 15.1 ms against 2.6 ms with nothing stored, and 2326 bytes of
     * payload (334 gzipped). Anything added here pays on every page load, so
     * measure it the same way rather than assuming it is free.
     */
    customSession(async ({ user, session }) => ({
      user,
      session,
      ...(await getSessionExtrasFor(user.id)),
    })),
    /**
     * Must be last in the plugin list: it writes better-auth's `Set-Cookie`
     * headers through Next's cookie API, which is what makes a server action or
     * route handler actually persist the session.
     */
    nextCookies(),
  ],
});
