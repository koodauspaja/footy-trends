import { afterEach, describe, expect, it, vi } from "vitest";
import { AVATAR_UPLOAD_PATH, readUploadAnswer, uploadAvatar } from "@/lib/avatar-upload";

/**
 * The settings page's half of the avatar upload: the request, and reading its
 * answer.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readUploadAnswer", () => {
  it("reads a saved picture's version", () => {
    expect(readUploadAnswer({ ok: true, version: "v1" })).toEqual({ ok: true, version: "v1" });
  });

  it.each(["missing", "too-large", "unsupported", "unreadable", "failed"] as const)(
    "reads the %s refusal",
    (reason) => {
      expect(readUploadAnswer({ ok: false, reason })).toEqual({ ok: false, reason });
    }
  );

  it.each([
    ["nothing", null],
    ["no body at all", undefined],
    ["text", "Bad Gateway"],
    ["a saved answer without a version", { ok: true }],
    ["a version that is not a string", { ok: true, version: 1 }],
    ["a refusal it does not know", { ok: false, reason: "teapot" }],
    ["a refusal without a reason", { ok: false }],
    ["no outcome at all", { version: "v1" }],
  ])("reads %s as no answer", (_case, body) => {
    expect(readUploadAnswer(body)).toBeNull();
  });
});

describe("uploadAvatar", () => {
  it("posts the file's bytes as they are, and returns the route's answer", async () => {
    const fetch = vi.fn(async () => Response.json({ ok: true, version: "v2" }));
    vi.stubGlobal("fetch", fetch);
    const file = new File([new Uint8Array([1, 2, 3])], "kuva.png", { type: "image/png" });

    expect(await uploadAvatar(file)).toEqual({ ok: true, version: "v2" });
    expect(fetch).toHaveBeenCalledWith(AVATAR_UPLOAD_PATH, {
      method: "POST",
      body: file,
      headers: { "Content-Type": "application/octet-stream" },
    });
  });

  it("returns a refusal the route answered with an error status", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json({ ok: false, reason: "unsupported" }, { status: 415 })
    );

    expect(await uploadAvatar(new File([], "kuva.png"))).toEqual({
      ok: false,
      reason: "unsupported",
    });
  });

  it("throws on an answer it cannot read, naming its status", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(uploadAvatar(new File([], "kuva.png"))).rejects.toThrow(
      "The avatar upload answered 502"
    );
  });

  it("lets a failed request reject", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });

    await expect(uploadAvatar(new File([], "kuva.png"))).rejects.toThrow("Failed to fetch");
  });
});
