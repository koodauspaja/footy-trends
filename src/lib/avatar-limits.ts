/**
 * The avatar's numbers and outcomes, with **no `sharp`** — the half of
 * specs/025-custom-avatar.md that a client component may import.
 *
 * The exclusion is load-bearing, and the same shape as the one at the top of
 * `regions.ts`. `avatar-image.ts` imports `sharp`, which reaches `fs` and
 * `child_process`; pulling any value out of it from `settings-page.tsx` — a
 * `"use client"` module — puts the whole encoder in the browser bundle and the
 * build fails on those two modules. Measured, not feared: importing
 * `MAX_UPLOAD_BYTES` from `avatar-image.ts` took every page on the site to a
 * 500.
 *
 * Types are erased and could have stayed, but the value could not, and a rule
 * with an exception is one nobody can apply at a glance.
 */

/** The stored square. 256 rather than the 28 it renders at, so a retina display and the settings preview both have pixels to use. */
export const AVATAR_SIZE = 256;

/** Always what we emit, and therefore always what we serve. */
export const AVATAR_CONTENT_TYPE = "image/webp";

/**
 * 8 MB, because a 12-megapixel phone photograph is 3-5 MB as JPEG and the
 * commonest upload there is must not bounce.
 *
 * Next's own server-action body limit sits under this at 1 MB by default, which
 * would make this number decorative — `next.config.ts` raises it to 10 MB so
 * that this cap is the one the reader meets.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Why an upload was refused. The Finnish for each lives in the component. */
export type AvatarRejection = "missing" | "too-large" | "unsupported" | "unreadable";
