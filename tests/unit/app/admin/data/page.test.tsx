import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The `/yllapito/data` route itself, from specs/029-forced-season-refresh.md.
 *
 * Without this file the route has no test, which vitest scores as 100% — it
 * only measures files a test imports — while Sonar correctly reports 0%. That
 * trap failed #370's gate at 70.1%.
 */
const { requireAdmin, listRuns, notFound, logger, state } = vi.hoisted(() => {
  const state = { adminId: "admin-1" as string | null, runsThrow: false };
  return {
    state,
    requireAdmin: vi.fn(async () => state.adminId),
    listRuns: vi.fn(async () => {
      if (state.runsThrow) throw new Error("database down");
      return [];
    }),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
    logger: { error: vi.fn() },
  };
});

vi.mock("@/lib/admin-guard", () => ({ requireAdmin }));
vi.mock("@/lib/refresh-runs", () => ({ listRuns }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/logger", () => ({ logger }));
// The form is a client component reaching for server actions; the page's job is
// to gate and to hand it the competition lists, which is what is asserted here.
vi.mock("@/components/refresh-form", () => ({
  RefreshForm: ({ domestic, foreign }: { domestic: unknown[]; foreign: unknown[] }) => (
    <div data-testid="form">{`${domestic.length}/${foreign.length}`}</div>
  ),
}));

beforeEach(() => {
  state.adminId = "admin-1";
  state.runsThrow = false;
  vi.clearAllMocks();
});

describe("the forced refresh page", () => {
  it("refuses a non-admin with the not-found page, and asks the database nothing", async () => {
    state.adminId = null;
    const { default: Page } = await import("@/app/admin/data/page");

    await expect(Page()).rejects.toThrow("NEXT_NOT_FOUND");
    // `notFound()` throws a control-flow signal, so no query is made for a
    // caller who may not see the answer.
    expect(listRuns).not.toHaveBeenCalled();
  });

  it("renders the form and the log for an admin", async () => {
    const { default: Page } = await import("@/app/admin/data/page");

    render(await Page());

    expect(screen.getByRole("heading", { name: "Kauden uudelleenhaku" })).toBeInTheDocument();
    expect(screen.getByTestId("form")).toBeInTheDocument();
    expect(screen.getByText("Ei aiempia päivityksiä.")).toBeInTheDocument();
  });

  it("offers both regions' competitions", async () => {
    const { default: Page } = await import("@/app/admin/data/page");

    render(await Page());

    const [domestic, foreign] = (screen.getByTestId("form").textContent ?? "")
      .split("/")
      .map(Number);
    expect(domestic).toBeGreaterThan(0);
    expect(foreign).toBeGreaterThan(0);
  });

  it("raises a failed log read rather than rendering an empty log", async () => {
    // "Ei aiempia päivityksiä." would tell an admin nothing has ever been
    // refreshed, which is a claim a database error cannot support — and this
    // page exists partly so that list can be trusted.
    state.runsThrow = true;
    const { default: Page } = await import("@/app/admin/data/page");

    await expect(Page()).rejects.toThrow("database down");
    expect(logger.error).toHaveBeenCalled();
  });
});
