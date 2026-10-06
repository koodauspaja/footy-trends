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
 * Reads a variable sign-in cannot work without, and throws naming it when it is
 * missing, so the module fails to load instead of the OAuth flow failing later.
 *
 * decisions/023-google-oauth-login.md
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for authentication but is not set`);
  }
  return value;
}

/**
 * A comma-separated variable as a list: the headers that carry the client's
 * address, or the proxy hops to skip. Name only a header the edge is measured
 * to overwrite: one a client can set is not an address.
 *
 * decisions/309-client-ip-resolution.md
 */
function headerList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== "");
}

const DEFAULT_CLIENT_IP_HEADERS = ["x-real-ip"];

/**
 * The better-auth server instance: Google the only provider, sessions in
 * Postgres.
 *
 * decisions/023-google-oauth-login.md
 * decisions/024-account-settings.md
 * decisions/026-favourites.md
 * decisions/309-client-ip-resolution.md
 * decisions/314-sign-in-allowlist.md
 * decisions/318-rate-limit-storage.md
 */
export const auth = betterAuth({
  secret: required("BETTER_AUTH_SECRET"),
  baseURL: required("BETTER_AUTH_URL"),

  /**
   * Where the client's address is read from. `trustedProxies` is passed only
   * when it is set.
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
   * Rate-limit counters in Redis, through `customStorage`: `secondaryStorage`
   * would move sessions there too.
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
     * Who may sign in at all, where an environment says so. Runs before a user is
     * created and on every OAuth sign-in.
     */
    validateUserInfo: ({ user }) => signInRefusal(user.email),

    /**
     * Account deletion, for the settings page's `Poista tili`. No verification
     * email: it happens immediately.
     */
    deleteUser: { enabled: true },
  },

  session: {
    /**
     * Off: database sessions, so signing out revokes immediately.
     */
    cookieCache: { enabled: false },
  },

  plugins: [
    /**
     * Puts on the session what the client acts on: the start-page preference,
     * whether there is a custom avatar, and the favourites. It runs on every
     * session read, so anything added here is measured first.
     */
    customSession(async ({ user, session }) => ({
      user,
      session,
      ...(await getSessionExtrasFor(user.id)),
    })),
    /**
     * Writes better-auth's cookies through Next's cookie API, so a server action
     * persists the session. Must be last in the plugin list.
     */
    nextCookies(),
  ],
});
