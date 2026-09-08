import sharp from "sharp";
import {
  AVATAR_CONTENT_TYPE,
  AVATAR_SIZE,
  type AvatarRejection,
  MAX_UPLOAD_BYTES,
} from "@/lib/avatar-limits";

/**
 * Turning whatever a reader picked into something we are willing to store, from
 * specs/025-custom-avatar.md.
 *
 * No database and no session — this is the half that is pure, so every
 * rejection can be tested by calling a function rather than by driving a page.
 *
 * **Nothing that a client component imports may live here.** `sharp` reaches
 * `fs` and `child_process`, so the numbers and the rejection type sit in
 * `avatar-limits.ts` instead — see the comment there for what it cost to learn.
 */

/**
 * Bounds a decompression bomb: a few hundred kilobytes of PNG can declare
 * 40000×40000, which sharp's own default limit (~268 megapixels) would happily
 * attempt at roughly 800 MB of raw pixels. 40 MP covers every phone camera and
 * peaks around 120 MB.
 */
const MAX_INPUT_PIXELS = 40_000_000;

export type AvatarImageResult =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; reason: AvatarRejection };

/**
 * What the file actually is, read from its first bytes.
 *
 * The browser's `Content-Type` is the client's claim about its own file and is
 * not evidence: a renamed PDF arrives as `image/png` for the asking. These four
 * are what we decode, and the check is on the bytes.
 */
function isSupportedImage(bytes: Buffer): boolean {
  // PNG: \x89PNG\r\n\x1a\n
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return true;
  }
  // JPEG: every variant starts FF D8 FF.
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  // WebP: a RIFF container whose form type is WEBP, so both must match — a
  // RIFF-wrapped WAV is not an image.
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return true;
  }
  // HEIC: an ISO-BMFF box whose type is `ftyp`, with a brand this sharp can
  // decode. What an iPhone hands over when the file is not converted on the
  // way.
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = bytes.subarray(8, 12).toString("latin1");
    return ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
  }
  return false;
}

/**
 * One upload, validated and re-encoded, or the reason it was refused.
 *
 * The order is the point. The byte cap is applied before anything decodes,
 * because a cap applied after decoding is not a cap; the type is read from the
 * bytes before sharp is asked to interpret them; and the pixel limit bounds
 * what sharp will attempt even for a file that passed both.
 *
 * Every rejection is a `reason` rather than a message, because the strings are
 * Finnish UI copy and belong in the component.
 */
export async function processAvatar(file: File): Promise<AvatarImageResult> {
  if (file.size === 0) return { ok: false, reason: "missing" };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, reason: "too-large" };

  // No second cap check on the buffer. `File.size` is derived from the bytes by
  // the runtime that parsed the body, not claimed by the client, so a
  // re-check here is a branch that cannot be taken — and an untestable branch
  // reads as a guarded case rather than an impossible one.
  const uploaded = Buffer.from(await file.arrayBuffer());
  if (!isSupportedImage(uploaded)) return { ok: false, reason: "unsupported" };

  try {
    const bytes = await sharp(uploaded, { limitInputPixels: MAX_INPUT_PIXELS })
      // Before the resize, so a phone photo is not stored on its side. This is
      // also what drops EXIF — including the GPS coordinates a phone writes —
      // because the orientation is applied to the pixels and the metadata is
      // not carried into the output.
      .rotate()
      // `attention` crops by saliency rather than taking the middle, which is
      // the difference between keeping a face and keeping a chin.
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 80 })
      .toBuffer();

    return { ok: true, bytes, contentType: AVATAR_CONTENT_TYPE };
  } catch {
    // A valid header over a corrupt body, or a canvas past the pixel limit.
    // Both are "we cannot read this", and neither is worth telling the reader
    // apart.
    return { ok: false, reason: "unreadable" };
  }
}
