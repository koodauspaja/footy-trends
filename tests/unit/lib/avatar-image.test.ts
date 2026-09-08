import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { processAvatar } from "@/lib/avatar-image";
import { AVATAR_SIZE, MAX_UPLOAD_BYTES } from "@/lib/avatar-limits";

/**
 * The upload pipeline from specs/025-custom-avatar.md, driven with real files
 * through the real encoder.
 *
 * `sharp` is deliberately not mocked. Every claim this module makes — the
 * output is square, the orientation is applied, the EXIF is gone, a corrupt
 * body is refused — is a claim about what the encoder does, and a mock would
 * assert only that the code calls the functions the code calls.
 */

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "avatar");

function fileFrom(name: string, type = "image/png"): File {
  return new File([new Uint8Array(readFileSync(path.join(FIXTURES, name)))], name, { type });
}

/** A file of a given size whose bytes are never read, for the cap. */
function sizedFile(bytes: number): File {
  return new File([new Uint8Array(bytes)], "big.png", { type: "image/png" });
}

describe("processAvatar", () => {
  it.each([
    ["a JPEG", "landscape.jpg", "image/jpeg"],
    ["a PNG", "landscape.png", "image/png"],
    ["a WebP", "landscape.webp", "image/webp"],
  ])("re-encodes %s to a square WebP", async (_case, name, type) => {
    const result = await processAvatar(fileFrom(name, type));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.contentType).toBe("image/webp");

    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(AVATAR_SIZE);
    expect(metadata.height).toBe(AVATAR_SIZE);
  });

  /** One channel of one pixel, for reading which way a gradient runs. */
  async function grey(bytes: Buffer, x: number, y: number): Promise<number> {
    const [value] = await sharp(bytes)
      .extract({ left: x, top: y, width: 1, height: 1 })
      .raw()
      .toBuffer();
    return value ?? 0;
  }

  it("applies EXIF orientation, which is visible in the pixels", async () => {
    /**
     * The fixture is stored 400×200 with a **horizontal** gradient and
     * orientation 6 — "rotate to display" — so displayed correctly its gradient
     * runs top to bottom.
     *
     * The assertion is the gradient's *direction*, not a colour at a position.
     * `position: "attention"` chooses the crop by saliency, so where the square
     * lands is not fixed; which way the gradient runs inside it is. An earlier
     * version of this test used a solid-colour fixture and passed with
     * `.rotate()` deleted, which is worse than having no test: measured with
     * the encoder, the vertical delta is 107 with the rotation and 1 without.
     */
    const source = await sharp(readFileSync(path.join(FIXTURES, "rotated.jpg"))).metadata();
    expect(source.orientation).toBe(6);

    const result = await processAvatar(fileFrom("rotated.jpg", "image/jpeg"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.width).toBe(AVATAR_SIZE);
    expect(metadata.height).toBe(AVATAR_SIZE);

    const [top, bottom, left, right] = await Promise.all([
      grey(result.bytes, 128, 20),
      grey(result.bytes, 128, 236),
      grey(result.bytes, 20, 128),
      grey(result.bytes, 236, 128),
    ]);
    expect(Math.abs(top - bottom)).toBeGreaterThan(50);
    expect(Math.abs(left - right)).toBeLessThan(20);
  });

  it("carries none of the source metadata into the stored bytes", async () => {
    // A real phone photograph's EXIF carries GPS coordinates, and re-encoding
    // is what drops them. The fixture has 186 bytes of it going in.
    expect(
      (await sharp(readFileSync(path.join(FIXTURES, "rotated.jpg"))).metadata()).exif
    ).toBeDefined();

    const result = await processAvatar(fileFrom("rotated.jpg", "image/jpeg"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.exif).toBeUndefined();
    // Applied to the pixels above, so nothing is left for a viewer to apply.
    expect(metadata.orientation).toBeUndefined();
  });

  it("keeps transparency, which WebP can carry", async () => {
    const result = await processAvatar(fileFrom("transparent.png"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await sharp(result.bytes).metadata()).hasAlpha).toBe(true);
  });

  it("produces bytes small enough that the storage arithmetic holds", async () => {
    // The spec's capacity table is built on ~21 kB an avatar, measured from
    // incompressible noise. A change that blew past that — a larger size, a
    // higher quality, a format without compression — would invalidate the
    // threshold in `avatar.ts` silently.
    const result = await processAvatar(fileFrom("landscape.png"));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes.byteLength).toBeLessThan(32 * 1024);
  });

  it("refuses an empty file", async () => {
    expect(await processAvatar(new File([], "nothing.png"))).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("refuses a file over the cap without reading it", async () => {
    // `sizedFile` is zeroes, not an image. If the cap were applied after
    // decoding, this would come back `unsupported` — the reason names which
    // check ran first.
    expect(await processAvatar(sizedFile(MAX_UPLOAD_BYTES + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
  });

  it("accepts a file exactly at the cap, so the boundary is not off by one", async () => {
    // Zeroes are not an image, so the *next* check is what rejects it. That is
    // the point: it got past the cap.
    expect(await processAvatar(sizedFile(MAX_UPLOAD_BYTES))).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("refuses a PDF renamed to .png, whatever the browser calls it", async () => {
    // The file claims `image/png` in its type and its name. Only the bytes
    // disagree, and the bytes are the evidence.
    expect(await processAvatar(fileFrom("renamed.png"))).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("refuses a real PNG header over a body that is not one", async () => {
    // Sniffing passes and decoding fails — the case that separates
    // `unsupported` from `unreadable`. Verified against the encoder: this
    // fixture throws `vipspng: libpng read error`.
    expect(await processAvatar(fileFrom("corrupt.png"))).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("refuses a RIFF container that is not a WebP", async () => {
    // `RIFF` alone is not enough: a WAV file starts the same way. Both the
    // container and the form type have to match.
    const riff = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WAVE"),
      Buffer.alloc(64),
    ]);
    const file = new File([new Uint8Array(riff)], "sound.webp", { type: "image/webp" });

    expect(await processAvatar(file)).toEqual({ ok: false, reason: "unsupported" });
  });

  it("accepts an HEIC container by its brand", async () => {
    // What an iPhone hands over when the file is not converted on the way. The
    // body here is not a real HEIC, so it fails at *decoding* — which is the
    // assertion: it got past the type check that a `.heic` upload has to.
    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from("ftypheic"),
      Buffer.alloc(64),
    ]);
    const file = new File([new Uint8Array(heic)], "photo.heic", { type: "image/heic" });

    expect(await processAvatar(file)).toEqual({ ok: false, reason: "unreadable" });
  });
});
