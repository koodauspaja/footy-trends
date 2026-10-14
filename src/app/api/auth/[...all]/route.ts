import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

/**
 * better-auth's own routes: sign-in, sign-out, the Google callback and the
 * session read the header makes. Never cached: a cached response would serve
 * one reader's session to another.
 *
 * decisions/023-google-oauth-login.md
 */
export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler(auth);
