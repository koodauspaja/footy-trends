import { once } from "node:events";
import { createServer, type Server, Socket } from "node:net";
import Redis from "ioredis";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Staging sleeps when idle only because two query strings on its addresses silence the clients'
 * keepalives (docs/infrastructure.md, *Staging sleeps*). Renovate upgrades the pinned libraries
 * unasked, so what each reads from an address, and what Redis then does to the socket, is pinned.
 *
 * decisions/551-staging-sleeps-when-idle.md
 */

// The other half, what postgres.js does to a live connection, needs a real database
// server: it is in `tests/integration/staging-sleep-settings.test.ts`.

let server: Server;
let port = 0;
const accepted: Socket[] = [];

beforeAll(async () => {
  // Something to connect to: it accepts, and never speaks.
  server = createServer((socket) => {
    accepted.push(socket);
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  port = typeof address === "object" && address !== null ? address.port : 0;
});

afterAll(async () => {
  for (const socket of accepted) socket.destroy();
  await new Promise((resolve) => server.close(resolve));
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Connects as the app does, and returns every keepalive setting put on a socket
// meanwhile.
async function keepAlivesSetBy(address: string): Promise<unknown[][]> {
  const setKeepAlive = vi.spyOn(Socket.prototype, "setKeepAlive");
  const client = new Redis(address, {
    lazyConnect: true,
    // The listener is no Redis: no ready check to wait for, and no reconnecting.
    enableReadyCheck: false,
    retryStrategy: () => null,
  });

  try {
    // `connect()` itself never settles here, since nothing answers as Redis
    // would. The socket being connected is all this is about.
    client.connect().catch(() => {});
    await once(client, "connect");
    return [...setKeepAlive.mock.calls];
  } finally {
    client.disconnect();
  }
}

describe("the address settings that let staging sleep (#551)", () => {
  it("ioredis puts a 30 s TCP keepalive on its connection by default", async () => {
    expect(await keepAlivesSetBy(`redis://127.0.0.1:${port}`)).toEqual([[true, 30000]]);
  });

  it("ioredis puts no keepalive on a connection whose address says keepAlive=off", async () => {
    expect(await keepAlivesSetBy(`redis://127.0.0.1:${port}?keepAlive=off`)).toEqual([]);
  });

  it("ioredis still reads the host and port beside that setting", () => {
    const quiet = new Redis("redis://default:x@redis.example.com:6379?keepAlive=off", {
      lazyConnect: true,
    });

    try {
      expect(quiet.options).toMatchObject({ host: "redis.example.com", port: 6379 });
    } finally {
      quiet.disconnect();
    }
  });

  it("postgres.js takes idle_timeout from the address, and keeps none without it", async () => {
    // Neither opens a connection: postgres.js connects at its first query.
    const plain = postgres("postgres://user:x@db.example.com:5432/app");
    const quiet = postgres("postgres://user:x@db.example.com:5432/app?idle_timeout=20");

    try {
      // Idle connections stay open, with a keepalive every 60 s, unless told otherwise.
      expect(plain.options.idle_timeout).toBeNull();
      expect(plain.options.keep_alive).toBe(60);
      expect(Number(quiet.options.idle_timeout)).toBe(20);
      expect(quiet.options.host).toEqual(["db.example.com"]);
    } finally {
      await plain.end({ timeout: 0 });
      await quiet.end({ timeout: 0 });
    }
  });
});
