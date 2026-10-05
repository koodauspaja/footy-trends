import Redis from "ioredis";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

/**
 * Staging sleeps when idle only because two query strings on its addresses
 * silence the clients' keepalives (docs/infrastructure.md, *Staging sleeps*).
 * Both rest on how the pinned libraries read an address, and Renovate upgrades
 * them unasked, so what the strings rely on is pinned here. Neither client
 * connects: ioredis is lazy, and postgres.js opens nothing until a query.
 */
describe("the address settings that let staging sleep (#551)", () => {
  it("ioredis takes keepAlive from the address as text, which is what turns keepalives off", () => {
    const plain = new Redis("redis://default:x@redis.example.com:6379", { lazyConnect: true });
    const quiet = new Redis("redis://default:x@redis.example.com:6379?keepAlive=off", {
      lazyConnect: true,
    });

    try {
      // It enables TCP keepalive only for a number, and its default is one.
      expect(plain.options.keepAlive).toBe(30000);
      expect(typeof quiet.options.keepAlive).not.toBe("number");
      // The rest of the address is read as before.
      expect(quiet.options).toMatchObject({ host: "redis.example.com", port: 6379 });
    } finally {
      plain.disconnect();
      quiet.disconnect();
    }
  });

  it("postgres.js takes idle_timeout from the address, and keeps none without it", async () => {
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
