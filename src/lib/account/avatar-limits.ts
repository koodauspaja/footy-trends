/**
 * The avatar's numbers and outcomes, with no `sharp`: the half a client
 * component may import. A value imported from `avatar-image.ts` would put the
 * encoder in the browser bundle.
 *
 * decisions/025-custom-avatar.md
 */

/**
 * The stored square. 256 and not the 28 it renders at, so a retina display
 * and the settings preview both have pixels to use.
 *
 * decisions/025-custom-avatar.md
 */
export const AVATAR_SIZE = 256;

/**
 * Always what we emit, and therefore always what we serve.
 *
 * decisions/025-custom-avatar.md
 */
export const AVATAR_CONTENT_TYPE = "image/webp";

/**
 * 8 MB: the most the upload route reads of a body before refusing it.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Why an upload was refused. The Finnish for each lives in the component.
 *
 * decisions/025-custom-avatar.md
 */
export type AvatarRejection = "missing" | "too-large" | "unsupported" | "unreadable";

/**
 * What an upload answers: the new picture's cache token, or why it was refused.
 * `failed` is everything the reader cannot fix by choosing another file.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */
export type SaveAvatarResult =
  | { ok: true; version: string }
  | { ok: false; reason: AvatarRejection | "failed" };
