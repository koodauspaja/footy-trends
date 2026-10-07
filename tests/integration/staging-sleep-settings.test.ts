import { Socket } from "node:net";
import postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * What `?idle_timeout=` on a database address does to a live connection, which
 * staging's sleeping depends on. Against the test database: only a real
 * server shows whether the connection is still there.
 *
 * decisions/551-staging-sleeps-when-idle.md
 */

const NAME = `itest-sleep-${process.pid}`;

// The test database's address, with the query string staging's carries, sped up.
function address(idleTimeoutSeconds?: number): string {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (idleTimeoutSeconds !== undefined) {
    url.searchParams.set("idle_timeout", String(idleTimeoutSeconds));
  }
  return url.toString();
}

const clients: Array<ReturnType<typeof postgres>> = [];

function connect(name: string, idleTimeoutSeconds?: number) {
  const client = postgres(address(idleTimeoutSeconds), {
    max: 1,
    connection: { application_name: name },
  });
  clients.push(client);
  return client;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(clients.splice(0).map((client) => client.end({ timeout: 1 })));
});

describe("an idle timeout on the database address (#551)", () => {
  it("closes the connection once it has sat idle, where a plain address keeps it open", async () => {
    const observer = connect(`${NAME}-observer`);
    const quiet = connect(`${NAME}-quiet`, 1);
    const plain = connect(`${NAME}-plain`);
    const open = async (name: string) => {
      const [row] = await observer<Array<{ count: number }>>`
        select count(*)::int as count from pg_stat_activity where application_name = ${name}`;
      return row?.count;
    };

    await quiet`select 1`;
    await plain`select 1`;
    expect(await open(`${NAME}-quiet`)).toBe(1);
    expect(await open(`${NAME}-plain`)).toBe(1);

    // Past the one-second timeout, with room for the server to notice.
    await vi.waitFor(async () => expect(await open(`${NAME}-quiet`)).toBe(0), {
      timeout: 6000,
      interval: 250,
    });
    expect(await open(`${NAME}-plain`)).toBe(1);
  }, 15_000);

  it("holds an open connection with a TCP keepalive every 60 s", async () => {
    const setKeepAlive = vi.spyOn(Socket.prototype, "setKeepAlive");
    const plain = connect(`${NAME}-keepalive`);

    await plain`select 1`;

    // The packet that keeps an idle service awake, and why the timeout is needed.
    expect(setKeepAlive).toHaveBeenCalledWith(true, 60_000);
  });
});
