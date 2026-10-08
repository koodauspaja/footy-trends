import { afterEach, describe, expect, it, vi } from "vitest";
import { backoffSecondsFrom, fetchProviderJson } from "@/lib/provider-request";

/**
 * Requests to a provider: the rate-limit backoff, the per-attempt bound, and
 * what a caller's own signal does.
 *
 * decisions/197-rate-limit-backoff.md
 * decisions/182-national-team-pages-not-prerendered.md
 * decisions/363-render-timeouts.md
 * decisions/529-one-whole-number-parser.md
 */

const headers = (init: Record<string, string>) => new Headers(init);

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const rateLimited = (init: Record<string, string> = {}) =>
  new Response("", { status: 429, headers: init });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backoffSecondsFrom", () => {
  it("honours Retry-After in seconds", () => {
    expect(backoffSecondsFrom(headers({ "retry-after": "12" }))).toBe(12);
  });

  it("reads football-data.org's own header, which is what it actually sends", () => {
    // The provider does not send Retry-After. It sends the seconds until its
    // per-minute counter clears, so guessing instead would either retry too
    // early and fail again, or wait longer than needed.
    expect(backoffSecondsFrom(headers({ "x-requestcounter-reset": "30" }))).toBe(30);
  });

  it("prefers Retry-After when both are present", () => {
    expect(
      backoffSecondsFrom(headers({ "retry-after": "5", "x-requestcounter-reset": "30" }))
    ).toBe(5);
  });

  it("accepts an HTTP date, which Retry-After is allowed to be", () => {
    const at = new Date(Date.now() + 20_000).toUTCString();
    expect(backoffSecondsFrom(headers({ "retry-after": at }))).toBeGreaterThan(15);
    expect(backoffSecondsFrom(headers({ "retry-after": at }))).toBeLessThanOrEqual(21);
  });

  it("falls back to a default when the provider says nothing", () => {
    expect(backoffSecondsFrom(headers({}))).toBe(10);
  });

  it("waits the default for an empty header, rather than retrying at once", () => {
    // `Number("")` is 0, which would read an empty Retry-After as "now".
    expect(backoffSecondsFrom(headers({ "retry-after": "" }))).toBe(10);
    expect(backoffSecondsFrom(headers({ "retry-after": "   " }))).toBe(10);
    expect(backoffSecondsFrom(headers({ "x-requestcounter-reset": "" }))).toBe(10);
  });

  it("reads the provider's own header past an empty Retry-After", () => {
    expect(backoffSecondsFrom(headers({ "retry-after": "", "x-requestcounter-reset": "7" }))).toBe(
      7
    );
  });

  it("still retries at once when the provider says zero", () => {
    expect(backoffSecondsFrom(headers({ "retry-after": "0" }))).toBe(0);
  });

  it("ignores a header that is neither a number nor a date", () => {
    expect(backoffSecondsFrom(headers({ "retry-after": "soon" }))).toBe(10);
  });

  it("caps a wait no page render should sit through", () => {
    expect(backoffSecondsFrom(headers({ "retry-after": "3600" }))).toBe(35);
  });

  it("does not return a negative wait for a date already past", () => {
    const past = new Date(Date.now() - 60_000).toUTCString();
    expect(backoffSecondsFrom(headers({ "retry-after": past }))).toBe(0);
  });
});

describe("fetchProviderJson rate limiting", () => {
  it("retries once after a 429 and returns the eventual answer", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rateLimited({ "x-requestcounter-reset": "0" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    const result = await fetchProviderJson<{ ok: boolean }>("Test", "https://x", "/y", () => ({}));

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up rather than retrying forever", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(rateLimited({ "x-requestcounter-reset": "0" }));

    await expect(fetchProviderJson("Test", "https://x", "/y", () => ({}))).rejects.toThrow(
      "Test request failed: 429"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a status that retrying cannot change", async () => {
    // A 404 or a 403 is an answer. Waiting on one delays it without altering it.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("", { status: 404 }));

    await expect(fetchProviderJson("Test", "https://x", "/y", () => ({}))).rejects.toThrow(
      "Test request failed: 404"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not begin a backoff for a signal that is already aborted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rateLimited({ "retry-after": "30" }));
    const controller = new AbortController();
    controller.abort(new Error("already gone"));

    await expect(
      fetchProviderJson("Test", "https://x", "/y", () => ({}), controller.signal)
    ).rejects.toThrow();
  });

  it("lets a caller's timeout cut a backoff short", async () => {
    // The health endpoint bounds its provider call. A backoff must not hold it
    // past that bound: an endpoint that hangs is worse than one reporting the
    // provider as unreachable.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(rateLimited({ "retry-after": "30" }));
    const controller = new AbortController();
    const pending = fetchProviderJson("Test", "https://x", "/y", () => ({}), controller.signal);
    // Aborted once the backoff is genuinely under way, not before it starts —
    // otherwise this only exercises the guard at the top of the wait.
    await new Promise((resolve) => setTimeout(resolve, 10));
    controller.abort(new Error("timed out"));

    await expect(pending).rejects.toThrow("timed out");
  });
});

// A fetch that accepts the connection and then never answers: the only failure
// mode a status code cannot describe. It settles only when its signal aborts.
const stalls = () =>
  vi.spyOn(globalThis, "fetch").mockImplementation(
    (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = (init as RequestInit | undefined)?.signal ?? undefined;
        if (signal === undefined) return; // unbounded: hangs forever, which is the bug
        if (signal.aborted) return reject(signal.reason);
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      })
  );

describe("fetchProviderJson attempt bound (#363)", () => {
  it("aborts an attempt that stalls past the bound", async () => {
    stalls();

    await expect(
      fetchProviderJson("Test", "https://x", "/y", () => ({}), undefined, 25)
    ).rejects.toThrow();
  });

  it("does not cut short the wait a 429 asked for", async () => {
    // Why the bound is per attempt and not per call: a timeout spanning the
    // call would abort the backoff, turning a rate limit the retry was about to
    // clear into the "could not be loaded" page that retry exists to prevent.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(rateLimited({ "retry-after": "1" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    // 25ms bound, 1000ms backoff: forty times longer than the attempt bound.
    const result = await fetchProviderJson<{ ok: boolean }>(
      "Test",
      "https://x",
      "/y",
      () => ({}),
      undefined,
      25
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives each attempt its own budget rather than a shared one", async () => {
    // `AbortSignal.timeout` counts from creation, so a signal reused across attempts would leave
    // the retry what remained: here the backoff outlasts the budget sixteen times. Asserted through
    // behaviour, as `AbortSignal.any` mints a fresh object per call either way.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      const signal = (init as RequestInit | undefined)?.signal ?? undefined;
      if (signal?.aborted) return Promise.reject(signal.reason);
      return Promise.resolve(
        fetchMock.mock.calls.length === 1
          ? rateLimited({ "retry-after": "1" })
          : jsonResponse({ ok: true })
      );
    });

    const result = await fetchProviderJson<{ ok: boolean }>(
      "Test",
      "https://x",
      "/y",
      () => ({}),
      undefined,
      60
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends no signal at all when neither bound is given", async () => {
    // The health endpoint and the providers both pass one now, but an unbounded
    // call must still send exactly the request it sent before.
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ ok: true }));

    await fetchProviderJson("Test", "https://x", "/y", () => ({}));

    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("signal");
  });

  it("still honours the caller's signal when both are set", async () => {
    // The two stack: `/api/health` bounds the whole call, the provider bounds
    // one attempt, and whichever fires first wins.
    stalls();
    const controller = new AbortController();
    const pending = fetchProviderJson(
      "Test",
      "https://x",
      "/y",
      () => ({}),
      controller.signal,
      60_000
    );
    controller.abort(new Error("caller gave up"));

    await expect(pending).rejects.toThrow("caller gave up");
  });
});
