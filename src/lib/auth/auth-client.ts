"use client";

import { createAuthClient } from "better-auth/react";

/**
 * The browser half of better-auth. No `baseURL`: the client defaults to the
 * origin it is served from.
 *
 * decisions/023-google-oauth-login.md
 */
export const authClient = createAuthClient();

export const { signIn, signOut, useSession } = authClient;
