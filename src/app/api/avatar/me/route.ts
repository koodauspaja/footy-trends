import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAvatar } from "@/lib/avatar";
import { logger } from "@/lib/logger";

/**
 * Serves the reader their own stored avatar, from specs/025-custom-avatar.md.
 *
 * **`/me`, not `/[userId]`.** The session says who is asking; nothing in the URL
 * does. That is the same rule the write actions follow, and it means there is
 * no id to guess and no ownership check to get wrong.
 *
 * Node rather than edge: this reads a session and the database, and neither
 * belongs on an edge runtime.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A year, and `immutable` — which is only safe because the URL carries
 * `?v=<random token>`. A new upload produces a new URL, so the old one is never
 * requested again. Without the version parameter this would pin a stale picture
 * for a year.
 *
 * The token is random rather than a timestamp for a second reason: this path is
 * the same for every reader, so the parameter is the only thing keeping one
 * reader's cached image off another's URL. Two timestamps landing in the same
 * millisecond would have shared one. See `avatar.ts`.
 *
 * `private` because the response is scoped to one reader's session: a shared
 * cache must never hold it.
 */
const CACHE_CONTROL = "private, max-age=31536000, immutable";

export async function GET(): Promise<Response> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session === null) return new Response(null, { status: 401 });

    const avatar = await getAvatar(session.user.id);
    // Signed in with no custom picture. Not an error — the header falls back to
    // the Google image, and then to the name.
    if (avatar === null) return new Response(null, { status: 404 });

    return new Response(new Uint8Array(avatar.bytes), {
      headers: {
        "Content-Type": avatar.contentType,
        "Cache-Control": CACHE_CONTROL,
        // The bytes are our own re-encode, but the header still says so
        // explicitly: nothing served here may be sniffed into another type.
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Content-Length": String(avatar.bytes.byteLength),
      },
    });
  } catch (error) {
    // A failure here costs the reader their picture, not the page: the account
    // menu renders the name when the image does not load.
    logger.error({ err: error }, "Serving an avatar failed");
    return new Response(null, { status: 500 });
  }
}
