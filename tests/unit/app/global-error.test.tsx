import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException }));

/**
 * The boundary Next renders when the app itself has failed — the last thing a
 * reader sees, and the one page that cannot rely on anything else working.
 * Nothing asserted that it rendered at all until #403.
 *
 * `NextError` is rendered for real rather than mocked: what is worth pinning is
 * that this component produces a page, and a mock of the thing that produces it
 * would assert only that the code calls the function the code calls.
 */
import GlobalError from "@/app/global-error";

afterEach(() => {
  vi.clearAllMocks();
});

const failure = Object.assign(new Error("boom"), { digest: "abc123" });

describe("GlobalError", () => {
  it("renders Next's generic error page rather than nothing", () => {
    const { container } = render(<GlobalError error={failure} />);

    expect(container.textContent).toContain("Application error");
  });

  it("shows no status code, which is what passing 0 asks for", () => {
    /**
     * The App Router exposes no status code for an error, so 0 selects the
     * generic message. Next renders a numbered heading for any real code, so a
     * `500` here would mean the prop had started carrying something.
     */
    const { container } = render(<GlobalError error={failure} />);

    // Next does render a heading — it carries the generic message — but no
    // number: `statusCode={404}` would put "404" in it.
    expect(screen.getByRole("heading").textContent).toContain("Application error");
    expect(container.textContent).not.toMatch(/\b[45]\d\d\b/);
  });

  it("reports the failure to Sentry, digest and all", () => {
    render(<GlobalError error={failure} />);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("reports again when a different error arrives", () => {
    const { rerender } = render(<GlobalError error={failure} />);
    const second = new Error("another");

    rerender(<GlobalError error={second} />);

    // `rerender`, not a second `render`: the effect's dependency is the error,
    // and mounting a fresh component would report a second time whatever the
    // dependency list said — a test that passes with `[error]` deleted.
    expect(captureException).toHaveBeenNthCalledWith(2, second);
  });

  it("does not report twice for the same error", () => {
    const { rerender } = render(<GlobalError error={failure} />);

    rerender(<GlobalError error={failure} />);

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
