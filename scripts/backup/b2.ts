/**
 * Backblaze B2's native API, the four operations a backup and a restore need. Its
 * v4: a key made through the API is refused by v3.
 *
 * decisions/807-database-backup.md
 */
import { createHash } from "node:crypto";

const AUTHORIZE_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * A key's session: where to call, and the one bucket the key is limited to.
 *
 * decisions/807-database-backup.md
 */
export type Session = {
  token: string;
  apiUrl: string;
  downloadUrl: string;
  bucketId: string;
  bucketName: string;
  /** What the key may do, as B2 names it. */
  capabilities: string[];
};

async function json<T>(response: Response, call: string): Promise<T> {
  const body = await response.text();
  if (!response.ok) throw new Error(`B2 ${call} answered ${response.status}: ${body}`);
  return JSON.parse(body) as T;
}

type AuthorizeBody = {
  authorizationToken: string;
  apiInfo: {
    storageApi: {
      apiUrl: string;
      downloadUrl: string;
      allowed: { buckets: { id: string; name: string }[] | null; capabilities: string[] };
    };
  };
};

/**
 * A session for the key. A key not limited to exactly one bucket is refused,
 * so a backup cannot land in a bucket nobody chose.
 *
 * decisions/807-database-backup.md
 */
export async function authorize(keyId: string, key: string, fetchFn: Fetch): Promise<Session> {
  const credentials = Buffer.from(`${keyId}:${key}`).toString("base64");
  const response = await fetchFn(AUTHORIZE_URL, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  const body = await json<AuthorizeBody>(response, "b2_authorize_account");
  const storage = body.apiInfo.storageApi;
  const buckets = storage.allowed.buckets ?? [];
  const [bucket] = buckets;
  if (bucket === undefined || buckets.length > 1) {
    throw new Error("The B2 key must be limited to exactly one bucket.");
  }
  return {
    token: body.authorizationToken,
    apiUrl: storage.apiUrl,
    downloadUrl: storage.downloadUrl,
    bucketId: bucket.id,
    bucketName: bucket.name,
    capabilities: storage.allowed.capabilities,
  };
}

function call(session: Session, name: string, payload: object, fetchFn: Fetch): Promise<Response> {
  return fetchFn(`${session.apiUrl}/b2api/v4/${name}`, {
    method: "POST",
    headers: { Authorization: session.token },
    body: JSON.stringify(payload),
  });
}

/**
 * Uploads `bytes` as `fileName`. The bucket's default retention locks it.
 *
 * decisions/807-database-backup.md
 */
export async function upload(
  session: Session,
  fileName: string,
  bytes: Uint8Array<ArrayBuffer>,
  fetchFn: Fetch
): Promise<void> {
  const target = await json<{ uploadUrl: string; authorizationToken: string }>(
    await call(session, "b2_get_upload_url", { bucketId: session.bucketId }, fetchFn),
    "b2_get_upload_url"
  );
  const response = await fetchFn(target.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: target.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(fileName).replaceAll("%2F", "/"),
      "Content-Type": "application/octet-stream",
      "X-Bz-Content-Sha1": createHash("sha1").update(bytes).digest("hex"),
    },
    body: bytes,
  });
  await json(response, "b2_upload_file");
}

/**
 * Every file name in the bucket, page by page.
 *
 * decisions/807-database-backup.md
 */
export async function listFileNames(
  session: Session,
  fetchFn: Fetch,
  startFileName: string | null = null
): Promise<string[]> {
  const page: { files: { fileName: string }[]; nextFileName: string | null } = await json(
    await call(
      session,
      "b2_list_file_names",
      { bucketId: session.bucketId, maxFileCount: 1000, startFileName },
      fetchFn
    ),
    "b2_list_file_names"
  );
  const names = page.files.map((file) => file.fileName);
  if (page.nextFileName === null) return names;
  return [...names, ...(await listFileNames(session, fetchFn, page.nextFileName))];
}

/**
 * One file's bytes, by name.
 *
 * decisions/807-database-backup.md
 */
export async function download(
  session: Session,
  fileName: string,
  fetchFn: Fetch
): Promise<Uint8Array> {
  const path = encodeURIComponent(fileName).replaceAll("%2F", "/");
  const response = await fetchFn(`${session.downloadUrl}/file/${session.bucketName}/${path}`, {
    headers: { Authorization: session.token },
  });
  if (!response.ok) {
    throw new Error(
      `B2 download of ${fileName} answered ${response.status}: ${await response.text()}`
    );
  }
  return new Uint8Array(await response.arrayBuffer());
}
