import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A fold: a region named by its heading, in a `<details>` that starts as it is
 * told. A toggle is saved only when the fold names what to remember, and a
 * failed save leaves the fold as the reader set it.
 *
 * decisions/071-section-toggles.md
 */

const { saveSectionChoiceAction, reportClientError } = vi.hoisted(() => ({
  saveSectionChoiceAction: vi.fn(async () => ({ ok: true })),
  reportClientError: vi.fn(),
}));

vi.mock("@/lib/section-choice-actions", () => ({ saveSectionChoiceAction }));
vi.mock("@/lib/report-client-error", () => ({ reportClientError }));

const { SectionFold } = await import("@/components/section-fold");

beforeEach(() => {
  vi.clearAllMocks();
  saveSectionChoiceAction.mockResolvedValue({ ok: true });
});

function renderFold(
  initiallyOpen: boolean,
  remember: { kind: "team"; section: string } | null = { kind: "team", section: "analytics" }
) {
  const view = render(
    <SectionFold
      headingId="analytics"
      initiallyOpen={initiallyOpen}
      remember={remember}
      summary={<h2 id="analytics">Analyysit</h2>}
    >
      <p>Sisältö</p>
    </SectionFold>
  );
  const details = view.container.querySelector("details") as HTMLDetailsElement;
  return { ...view, details };
}

// What the browser does when the reader presses the summary.
function toggle(details: HTMLDetailsElement, open: boolean) {
  details.open = open;
  fireEvent(details, new Event("toggle"));
}

describe("SectionFold", () => {
  it("starts open or closed as it is told, the heading inside its summary", () => {
    const { details } = renderFold(false);

    expect(details.open).toBe(false);
    expect(screen.getByText("Sisältö")).not.toBeVisible();
    const heading = screen.getByRole("heading", { name: "Analyysit" });
    expect(details.querySelector("summary")).toContainElement(heading);
    expect(screen.getByRole("region", { name: "Analyysit" })).toContainElement(details);
  });

  it("saves the reader's toggle under its kind and section", async () => {
    const { details } = renderFold(false);

    await act(async () => toggle(details, true));
    expect(saveSectionChoiceAction).toHaveBeenLastCalledWith("team", "analytics", true);

    await act(async () => toggle(details, false));
    expect(saveSectionChoiceAction).toHaveBeenLastCalledWith("team", "analytics", false);
    expect(saveSectionChoiceAction).toHaveBeenCalledTimes(2);
  });

  it("saves nothing when the browser only announces the state it was rendered in", async () => {
    const { details } = renderFold(true);

    await act(async () => toggle(details, true));
    expect(saveSectionChoiceAction).not.toHaveBeenCalled();
  });

  it("saves nothing for a fold with nothing to remember, and still folds", async () => {
    const { details } = renderFold(true, null);

    await act(async () => toggle(details, false));
    expect(details.open).toBe(false);
    expect(saveSectionChoiceAction).not.toHaveBeenCalled();
  });

  it("reports a save that could not be sent, and keeps the fold as the reader set it", async () => {
    const failure = new Error("offline");
    saveSectionChoiceAction.mockRejectedValue(failure);
    const { details } = renderFold(false);

    await act(async () => toggle(details, true));
    expect(details.open).toBe(true);
    expect(reportClientError).toHaveBeenCalledWith(failure, "section-fold");
  });
});
