import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAvatar } from "@/lib/avatar";
import { logger } from "@/lib/logger";

/**
 * Serves the reader their own stored avatar. `/me`, not `/[userId]`: the
 * session says who is asking, and nothing in the URL does. Node, not edge.
 *
 * decisions/025-custom-avatar.md
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A year, and `immutable`: safe only because the URL carries a random
 * `?v=` token, new with every upload and different for every reader. `private`,
 * so no shared cache holds it.
 *
 * decisions/025-custom-avatar.md
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
