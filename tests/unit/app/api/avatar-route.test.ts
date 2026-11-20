import { beforeEach, describe, expect, it, vi } from "vitest";
import { warmModules } from "../../../support/warm-module";

/**
 * The route that serves a reader their own uploaded picture, and replaces it.
 *
 * decisions/025-custom-avatar.md
 * decisions/810-avatar-upload-route.md
 */

const { getSession, getAvatar, saveAvatar, processAvatar, revalidatePath, logger } = vi.hoisted(
  () => ({
    getSession: vi.fn(),
    getAvatar: vi.fn(),
    saveAvatar: vi.fn(),
    processAvatar: vi.fn(),
    revalidatePath: vi.fn(),
    logger: { error: vi.fn(), warn: vi.fn() },
  })
);

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/avatar", () => ({ getAvatar, saveAvatar }));
vi.mock("@/lib/avatar-image", () => ({ processAvatar }));
vi.mock("@/lib/logger", () => ({ logger }));

const { GET, POST } = await import("@/app/api/avatar/me/route");
const { MAX_UPLOAD_BYTES } = await import("@/lib/avatar-limits");

const BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46]);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "user-1" } });
  getAvatar.mockResolvedValue({ bytes: BYTES, contentType: "image/webp", version: "avatar-token" });
  processAvatar.mockResolvedValue({ ok: true, bytes: BYTES, contentType: "image/webp" });
  saveAvatar.mockResolvedValue("new-token");
});

warmModules(() => import("@/app/api/avatar/me/route"));

describe("GET /api/avatar/me", () => {
  it("serves the stored bytes to their owner", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(BYTES);
    // The session says whose picture this is; nothing in the URL does.
    expect(getAvatar).toHaveBeenCalledWith("user-1");
  });

  it("caches for a year, privately, and refuses to be sniffed", async () => {
    // `immutable` is only safe because the URL carries `?v=<random token>`: a new
    // upload is a new URL, and no two readers share one. `private` because the response
    // is scoped to one reader's session, and a shared cache must never hold it.
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Disposition")).toBe("inline");
  });

  it("answers 401 when signed out", async () => {
    getSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(getAvatar).not.toHaveBeenCalled();
  });

  it("answers 404 for a reader with no picture of their own", async () => {
    // Not an error: the header falls back to the Google image, then the name.
    getAvatar.mockResolvedValue(null);

    expect((await GET()).status).toBe(404);
  });

  it("answers 500 rather than throwing when the read fails", async () => {
    // A failure costs the reader their picture, not the page — the menu renders
    // their name when the image does not load.
    getAvatar.mockRejectedValue(new Error("database down"));

    expect((await GET()).status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});

const SITE = "footy-trends.example.com";

/** A body that counts how many chunks were pulled from it. */
function countingBody(chunks: Uint8Array[]) {
  const pulled = { count: 0, cancelled: false };
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[pulled.count];
        pulled.count += 1;
        if (chunk === undefined) controller.close();
        else controller.enqueue(chunk);
      },
      // Nothing pulled ahead: every pull is one the route asked for.
    },
    { highWaterMark: 0 }
  );
  return { body, pulled };
}

function upload(
  body: BodyInit | null,
  headers: Record<string, string> = { origin: `https://${SITE}`, host: SITE }
): Request {
  return new Request(`https://${SITE}/api/avatar/me`, {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit);
}

describe("POST /api/avatar/me", () => {
  it("stores the body's bytes, processed, and answers with the new version", async () => {
    const response = await POST(upload(new Uint8Array([1, 2, 3])));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, version: "new-token" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const [file] = processAvatar.mock.calls[0] as [File];
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(saveAvatar).toHaveBeenCalledWith("user-1", BYTES, "image/webp");
    // The reader's URL, not the App Router folder behind the rewrite.
    expect(revalidatePath).toHaveBeenCalledWith("/asetukset");
  });

  it("joins a body that arrives in several chunks", async () => {
    const { body } = countingBody([new Uint8Array([1, 2]), new Uint8Array([3])]);

    expect((await POST(upload(body))).status).toBe(200);
    const [file] = processAvatar.mock.calls[0] as [File];
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("refuses a body past the cap without reading the rest", async () => {
    const megabyte = new Uint8Array(1024 * 1024);
    const { body, pulled } = countingBody(Array.from({ length: 20 }, () => megabyte));

    const response = await POST(upload(body));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, reason: "too-large" });
    // Eight megabytes fit, the ninth passes the cap, and nothing after it is pulled.
    expect(pulled.count).toBe(9);
    expect(processAvatar).not.toHaveBeenCalled();
    expect(saveAvatar).not.toHaveBeenCalled();
  });

  it("accepts a body of exactly the cap", async () => {
    expect((await POST(upload(new Uint8Array(MAX_UPLOAD_BYTES)))).status).toBe(200);
  });

  it("hands an empty body to the encoder as an empty file", async () => {
    processAvatar.mockResolvedValue({ ok: false, reason: "missing" });

    const response = await POST(upload(null));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, reason: "missing" });
    const [file] = processAvatar.mock.calls[0] as [File];
    expect(file.size).toBe(0);
  });

  it.each([
    ["unsupported", 415],
    ["unreadable", 422],
    ["missing", 400],
  ] as const)("passes the %s rejection through and stores nothing", async (reason, status) => {
    // Each maps to its own Finnish notice in the component.
    processAvatar.mockResolvedValue({ ok: false, reason });

    const response = await POST(upload(new Uint8Array([1])));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, reason });
    expect(saveAvatar).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("stores nothing for a signed-out caller, and does not read the body", async () => {
    getSession.mockResolvedValue(null);
    const { body, pulled } = countingBody([new Uint8Array([1])]);

    const response = await POST(upload(body));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, reason: "failed" });
    expect(pulled.count).toBe(0);
    expect(processAvatar).not.toHaveBeenCalled();
  });

  it.each([
    ["another site", { origin: "https://elsewhere.example.com", host: SITE }],
    ["no origin", { host: SITE }],
    ["an opaque origin", { origin: "null", host: SITE }],
    ["no host to compare with", { origin: `https://${SITE}` }],
    ["the same host on another port", { origin: `https://${SITE}:8443`, host: SITE }],
    [
      "a forwarded host that is not the origin",
      { origin: `https://${SITE}`, host: SITE, "x-forwarded-host": "proxy.example.com" },
    ],
  ])("refuses an upload from %s before reading the session", async (_case, headers) => {
    const response = await POST(upload(new Uint8Array([1]), headers));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ ok: false, reason: "failed" });
    expect(getSession).not.toHaveBeenCalled();
    expect(saveAvatar).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      {},
      "Avatar upload refused: the origin is not this site"
    );
  });

  it("compares the origin with the first forwarded host when a proxy sets one", async () => {
    const response = await POST(
      upload(new Uint8Array([1]), {
        origin: `https://${SITE}`,
        host: "10.0.0.7:8080",
        "x-forwarded-host": ` ${SITE} , proxy.example.com`,
      })
    );

    expect(response.status).toBe(200);
  });

  it("answers failed rather than throwing when the session lookup throws", async () => {
    getSession.mockRejectedValue(new Error("database down"));

    const response = await POST(upload(new Uint8Array([1])));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, reason: "failed" });
    expect(logger.error).toHaveBeenCalled();
  });

  it("answers failed rather than throwing when storing throws", async () => {
    saveAvatar.mockRejectedValue(new Error("write failed"));

    const response = await POST(upload(new Uint8Array([1])));

    expect(response.status).toBe(500);
    expect(logger.error).toHaveBeenCalled();
  });
});
