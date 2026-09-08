import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession, getAvatar, logger } = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAvatar: vi.fn(),
  logger: { error: vi.fn() },
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/avatar", () => ({ getAvatar }));
vi.mock("@/lib/logger", () => ({ logger }));

const { GET } = await import("@/app/api/avatar/me/route");

const BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46]);

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ user: { id: "user-1" } });
  getAvatar.mockResolvedValue({ bytes: BYTES, contentType: "image/webp", version: "avatar-token" });
});

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
    /**
     * `immutable` is only safe because the URL carries `?v=<random token>`: a
     * new upload is a new URL, and no two readers share one. `private` because
     * the response is scoped to one reader's session and a shared cache must
     * never hold it.
     */
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
