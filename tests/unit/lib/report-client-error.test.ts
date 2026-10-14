import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Where a failure a client component caught goes.
 *
 * decisions/604-client-failures-to-sentry.md
 */

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException }));

beforeEach(() => {
  captureException.mockClear();
});

describe("reportClientError", () => {
  it("hands Sentry the error as it was caught, tagged with where", async () => {
    const { reportClientError } = await import("@/lib/report-client-error");
    const error = new Error("network");

    reportClientError(error, "settings.save");

    expect(captureException.mock.calls).toEqual([[error, { tags: { where: "settings.save" } }]]);
  });

  it("passes on a rejection that is not an Error", async () => {
    const { reportClientError } = await import("@/lib/report-client-error");

    reportClientError("offline", "team-search");

    expect(captureException.mock.calls).toEqual([["offline", { tags: { where: "team-search" } }]]);
  });
});
