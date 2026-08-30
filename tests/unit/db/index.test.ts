import { beforeEach, describe, expect, it, vi } from "vitest";

const end = vi.fn(() => Promise.resolve());

// `postgres()` is called at module load, so the mock has to be in place before
// `@/db` is imported — hence the dynamic import inside the test.
vi.mock("postgres", () => ({ default: vi.fn(() => ({ end })) }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: vi.fn(() => ({})) }));

beforeEach(() => {
  end.mockClear();
  vi.resetModules();
});

describe("closeDatabase", () => {
  it("closes the connection the command-line tools open", async () => {
    // Without this the backfill hangs on exit with the connection still open,
    // and `process.exit` in its place can truncate output that has not flushed.
    const { closeDatabase } = await import("@/db");

    await closeDatabase();

    expect(end).toHaveBeenCalledTimes(1);
  });
});
