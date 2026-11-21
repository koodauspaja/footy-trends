import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  authorize,
  download,
  type Fetch,
  listFileNames,
  type Session,
  upload,
} from "../../../../scripts/backup/b2";

/**
 * The four B2 calls, against a fetch that answers from a script and records
 * what it was asked.
 *
 * decisions/807-database-backup.md
 */

type Call = { url: string; init: RequestInit | undefined };

function scripted(...responses: Response[]): { fetchFn: Fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fetchFn: Fetch = (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error(`Unexpected call to ${url}`);
    return Promise.resolve(next);
  };
  return { fetchFn, calls };
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function header(call: Call | undefined, name: string): string | undefined {
  return (call?.init?.headers as Record<string, string> | undefined)?.[name];
}

const SESSION: Session = {
  token: "session-token",
  apiUrl: "https://api.example.com",
  downloadUrl: "https://f.example.com",
  bucketId: "bucket-1",
  bucketName: "backups",
};

function authorized(buckets: { id: string; name: string }[] | null): Response {
  return ok({
    authorizationToken: "session-token",
    apiInfo: {
      storageApi: {
        apiUrl: "https://api.example.com",
        downloadUrl: "https://f.example.com",
        allowed: { buckets },
      },
    },
  });
}

describe("authorize", () => {
  it("opens a session on the key's one bucket, sending the key as basic auth", async () => {
    const { fetchFn, calls } = scripted(authorized([{ id: "bucket-1", name: "backups" }]));

    await expect(authorize("id", "secret", fetchFn)).resolves.toEqual(SESSION);
    expect(calls[0]?.url).toBe("https://api.backblazeb2.com/b2api/v4/b2_authorize_account");
    expect(header(calls[0], "Authorization")).toBe(
      `Basic ${Buffer.from("id:secret").toString("base64")}`
    );
  });

  it.each([
    ["no bucket", null],
    [
      "two buckets",
      [
        { id: "a", name: "a" },
        { id: "b", name: "b" },
      ],
    ],
  ])("refuses a key limited to %s", async (_case, buckets) => {
    const { fetchFn } = scripted(authorized(buckets));

    await expect(authorize("id", "secret", fetchFn)).rejects.toThrow(
      "The B2 key must be limited to exactly one bucket."
    );
  });

  it("reports what B2 answered when it refuses the key", async () => {
    const { fetchFn } = scripted(new Response('{"code":"unauthorized"}', { status: 401 }));

    await expect(authorize("id", "wrong", fetchFn)).rejects.toThrow(
      'B2 b2_authorize_account answered 401: {"code":"unauthorized"}'
    );
  });
});

describe("upload", () => {
  it("asks for an upload address, then sends the bytes with their SHA-1", async () => {
    const bytes = new TextEncoder().encode("dump");
    const { fetchFn, calls } = scripted(
      ok({ uploadUrl: "https://upload.example.com/u", authorizationToken: "upload-token" }),
      ok({ fileName: "20261121T000000Z/database.dump.age" })
    );

    await upload(SESSION, "20261121T000000Z/database.dump.age", bytes, fetchFn);

    expect(calls[0]?.url).toBe("https://api.example.com/b2api/v4/b2_get_upload_url");
    expect(calls[0]?.init?.body).toBe('{"bucketId":"bucket-1"}');
    expect(header(calls[0], "Authorization")).toBe("session-token");
    expect(calls[1]?.url).toBe("https://upload.example.com/u");
    expect(header(calls[1], "Authorization")).toBe("upload-token");
    expect(header(calls[1], "X-Bz-File-Name")).toBe("20261121T000000Z/database.dump.age");
    expect(header(calls[1], "X-Bz-Content-Sha1")).toBe(
      createHash("sha1").update(bytes).digest("hex")
    );
    expect(calls[1]?.init?.body).toBe(bytes);
  });

  it("fails when the upload itself is refused", async () => {
    const { fetchFn } = scripted(
      ok({ uploadUrl: "https://upload.example.com/u", authorizationToken: "upload-token" }),
      new Response("bad sha1", { status: 400 })
    );

    await expect(upload(SESSION, "x", new Uint8Array(), fetchFn)).rejects.toThrow(
      "B2 b2_upload_file answered 400: bad sha1"
    );
  });
});

describe("listFileNames", () => {
  it("follows the pages until B2 says there are no more", async () => {
    const { fetchFn, calls } = scripted(
      ok({ files: [{ fileName: "a" }], nextFileName: "b" }),
      ok({ files: [{ fileName: "b" }], nextFileName: null })
    );

    await expect(listFileNames(SESSION, fetchFn)).resolves.toEqual(["a", "b"]);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      bucketId: "bucket-1",
      maxFileCount: 1000,
      startFileName: null,
    });
    expect(JSON.parse(String(calls[1]?.init?.body)).startFileName).toBe("b");
  });
});

describe("download", () => {
  it("reads a file by its name from the session's bucket", async () => {
    const { fetchFn, calls } = scripted(new Response(new Uint8Array([1, 2, 3])));

    await expect(download(SESSION, "20261121T000000Z/counts.json.age", fetchFn)).resolves.toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(calls[0]?.url).toBe(
      "https://f.example.com/file/backups/20261121T000000Z/counts.json.age"
    );
    expect(header(calls[0], "Authorization")).toBe("session-token");
  });

  it("reports what B2 answered for a file it cannot give", async () => {
    const { fetchFn } = scripted(new Response("not found", { status: 404 }));

    await expect(download(SESSION, "gone", fetchFn)).rejects.toThrow(
      "B2 download of gone answered 404: not found"
    );
  });
});
