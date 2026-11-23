import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPacer,
  delayBefore,
  FOOTBALL_DATA_PER_MINUTE,
  intervalForRatePerMinute,
  providerPacers,
} from "@/lib/providers/pacer";

/**
 * The pacer that spaces provider requests under a rate limit.
 *
 * decisions/052-predictions-log.md
 * decisions/080-daily-refresh-of-every-competition.md
 */

describe("intervalForRatePerMinute", () => {
  it("converts a rate into the gap between requests", () => {
    expect(intervalForRatePerMinute(60)).toBe(1000);
    expect(intervalForRatePerMinute(9)).toBe(6667);
  });

  it("rejects a rate that would divide by zero or run backwards", () => {
    expect(() => intervalForRatePerMinute(0)).toThrow(/must be positive/);
    expect(() => intervalForRatePerMinute(-1)).toThrow(/must be positive/);
  });
});

describe("delayBefore", () => {
  it("does not wait before the first request", () => {
    expect(delayBefore(null, 1_000, 6667)).toBe(0);
  });

  it("waits only for the remainder of the interval", () => {
    // Database writes happen between requests; charging for time already spent
    // would make a 344-request run considerably longer than it needs to be.
    expect(delayBefore(1_000, 3_000, 6667)).toBe(4667);
  });

  it("does not wait at all once the interval has already passed", () => {
    expect(delayBefore(1_000, 9_000, 6667)).toBe(0);
  });
});
describe("createPacer", () => {
  function clock() {
    let time = 0;
    const waits: number[] = [];
    return {
      now: () => time,
      sleep: async (ms: number) => {
        waits.push(ms);
        time += ms;
      },
      advance: (ms: number) => {
        time += ms;
      },
      waits,
    };
  }

  it("runs the first request at once and spaces the rest", async () => {
    const fake = clock();
    const paced = createPacer(FOOTBALL_DATA_PER_MINUTE, fake);

    await paced(async () => "first");
    fake.advance(1_000);
    const second = await paced(async () => "second");

    expect(second).toBe("second");
    expect(fake.waits).toEqual([intervalForRatePerMinute(FOOTBALL_DATA_PER_MINUTE) - 1_000]);
  });

  it("spaces requests started at the same time, one interval apart", async () => {
    const fake = clock();
    const paced = createPacer(60, fake);
    const startedAt: number[] = [];

    await Promise.all(
      [1, 2, 3].map(() =>
        paced(async () => {
          startedAt.push(fake.now());
        })
      )
    );

    expect(startedAt).toEqual([0, 1_000, 2_000]);
  });

  it("does not wait when the interval has already passed", async () => {
    const fake = clock();
    const paced = createPacer(60, fake);

    await paced(async () => undefined);
    fake.advance(5_000);
    await paced(async () => undefined);

    expect(fake.waits).toEqual([]);
  });

  it("keeps football-data under its documented 10 a minute", () => {
    expect(FOOTBALL_DATA_PER_MINUTE).toBeLessThan(10);
  });

  describe("with the real clock", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("sleeps out the rest of the interval before the next request", async () => {
      vi.useFakeTimers();
      const paced = createPacer(60);
      let second = false;

      await paced(async () => undefined);
      const pending = paced(async () => {
        second = true;
      });
      await vi.advanceTimersByTimeAsync(999);
      expect(second).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await pending;

      expect(second).toBe(true);
    });
  });
});

describe("providerPacers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("spaces each provider at its own rate, independently of the other", async () => {
    vi.useFakeTimers();
    const pacers = providerPacers();
    const started: string[] = [];
    const run = (source: "football-data" | "taso") =>
      pacers[source](async () => {
        started.push(source);
      });

    await Promise.all([run("football-data"), run("taso")]);
    const secondTaso = run("taso");
    const secondFootballData = run("football-data");
    // TASO's 60 a minute: one a second.
    await vi.advanceTimersByTimeAsync(1_000);
    await secondTaso;
    expect(started).toEqual(["football-data", "taso", "taso"]);
    // football-data's 9 a minute: one every 6 667 ms.
    await vi.advanceTimersByTimeAsync(5_666);
    expect(started).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1);
    await secondFootballData;

    expect(started).toEqual(["football-data", "taso", "taso", "football-data"]);
  });
});
