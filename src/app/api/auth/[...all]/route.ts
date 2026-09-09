import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * better-auth's own routes — sign-in, sign-out, the Google callback and the
 * session read the header makes. See specs/023-google-oauth-login.md.
 *
 * `force-dynamic` for the same reason every other route here has it: these
 * responses are per-request and per-session, and a cached one would serve one
 * reader's session to another.
 */
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
