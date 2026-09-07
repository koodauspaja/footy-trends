import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { displayNameFor } from "@/lib/auth-profile";

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
 * The better-auth server instance, from specs/023-google-oauth-login.md.
 *
 * Google is the only provider, sessions live in Postgres, and nothing in the
 * app gates on a session yet — this exists so that #117 and favourite teams
 * have a real user to attach to.
 */
export const auth = betterAuth({
  secret: required("BETTER_AUTH_SECRET"),
  baseURL: required("BETTER_AUTH_URL"),

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

  /**
   * Must be last in the plugin list: it writes better-auth's `Set-Cookie`
   * headers through Next's cookie API, which is what makes a server action or
   * route handler actually persist the session.
   */
  plugins: [nextCookies()],
});
