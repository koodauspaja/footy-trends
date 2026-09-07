"use client";

import { createAuthClient } from "better-auth/react";

/**
 * The browser half of better-auth, from specs/023-google-oauth-login.md.
 *
 * No `baseURL`: the client defaults to the origin it is served from, which is
 * correct in every environment we run — localhost, a Railway preview, and
 * production — without a build-time `NEXT_PUBLIC_` variable that would be
 * inlined at build and wrong the moment the host differs.
 */
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
