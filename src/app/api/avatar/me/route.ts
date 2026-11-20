import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAvatar, saveAvatar } from "@/lib/avatar";
import { processAvatar } from "@/lib/avatar-image";
import { MAX_UPLOAD_BYTES, type SaveAvatarResult } from "@/lib/avatar-limits";
import { currentUserId } from "@/lib/current-user";
import { logger } from "@/lib/logger";

/**
 * The reader's own stored avatar: served on GET, replaced on POST. `/me`, not
 * `/[userId]`: the session says who is asking, and nothing in the URL does.
 * Node, not edge.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
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

type Refusal = Extract<SaveAvatarResult, { ok: false }>["reason"];

/**
 * The HTTP status each answer carries. The body says the same, and is what
 * the settings page reads.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */
const STATUS: Record<"saved" | "foreign-origin" | "signed-out" | Refusal, number> = {
  saved: 200,
  "foreign-origin": 403,
  "signed-out": 401,
  missing: 400,
  "too-large": 413,
  unsupported: 415,
  unreadable: 422,
  failed: 500,
};

function answer(result: SaveAvatarResult, status: number): Response {
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Whether the request comes from a page of this site: its `Origin` names the
 * host it was sent to, read as Next reads it for a server action. A request
 * without an `Origin` is refused, which no browser's POST is.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */
function fromThisSite(request: Request): boolean {
  const origin = request.headers.get("origin");
  const originHost = origin === null ? undefined : URL.parse(origin)?.host;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  return originHost === host;
}

/**
 * The body, read until it passes the cap: past it the rest is never read.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */
async function readCapped(request: Request): Promise<Buffer | "too-large"> {
  if (request.body === null) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    size += value.byteLength;
    if (size > MAX_UPLOAD_BYTES) {
      await reader.cancel();
      return "too-large";
    }
    chunks.push(value);
  }
}

/**
 * Replaces the reader's picture with the body's bytes, which are the chosen
 * file as it is: no form encoding, so the cap applies while it streams.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */
export async function POST(request: Request): Promise<Response> {
  if (!fromThisSite(request)) {
    logger.warn({}, "Avatar upload refused: the origin is not this site");
    return answer({ ok: false, reason: "failed" }, STATUS["foreign-origin"]);
  }
  try {
    // Before the body is read: a signed-out caller's bytes are never looked at.
    const userId = await currentUserId();
    if (userId === null) return answer({ ok: false, reason: "failed" }, STATUS["signed-out"]);

    const body = await readCapped(request);
    if (body === "too-large")
      return answer({ ok: false, reason: "too-large" }, STATUS["too-large"]);

    const processed = await processAvatar(new File([new Uint8Array(body)], "avatar"));
    if (!processed.ok) return answer(processed, STATUS[processed.reason]);

    const version = await saveAvatar(userId, processed.bytes, processed.contentType);
    // `/asetukset`, the URL the reader is on: the folder is `settings` only
    // because `next.config.ts` rewrites it.
    revalidatePath("/asetukset");
    return answer({ ok: true, version }, STATUS.saved);
  } catch (error) {
    logger.error({ err: error }, "Storing an avatar failed");
    return answer({ ok: false, reason: "failed" }, STATUS.failed);
  }
}
