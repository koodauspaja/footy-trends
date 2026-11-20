import type { SaveAvatarResult } from "@/lib/avatar-limits";

/**
 * Where the settings page sends a chosen picture.
 *
 * decisions/810-avatar-upload-route.md
 */
export const AVATAR_UPLOAD_PATH = "/api/avatar/me";

type Reason = Extract<SaveAvatarResult, { ok: false }>["reason"];

const REASONS: ReadonlySet<unknown> = new Set<Reason>([
  "missing",
  "too-large",
  "unsupported",
  "unreadable",
  "failed",
]);

function isReason(value: unknown): value is Reason {
  return REASONS.has(value);
}

/**
 * The route's answer, or null for anything else: a proxy's error page, an
 * empty body, a shape this code does not know.
 *
 * decisions/810-avatar-upload-route.md
 */
export function readUploadAnswer(body: unknown): SaveAvatarResult | null {
  if (typeof body !== "object" || body === null) return null;
  const answer = body as { ok?: unknown; version?: unknown; reason?: unknown };
  if (answer.ok === true && typeof answer.version === "string") {
    return { ok: true, version: answer.version };
  }
  if (answer.ok === false && isReason(answer.reason)) return { ok: false, reason: answer.reason };
  return null;
}

/**
 * Sends the file's bytes as they are. Throws when the request fails or the
 * answer cannot be read, so the caller reports it as it does any failure.
 *
 * decisions/810-avatar-upload-route.md
 */
export async function uploadAvatar(file: File): Promise<SaveAvatarResult> {
  const response = await fetch(AVATAR_UPLOAD_PATH, {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/octet-stream" },
  });
  const answer = readUploadAnswer(await response.json().catch(() => null));
  if (answer === null) throw new Error(`The avatar upload answered ${response.status}`);
  return answer;
}
