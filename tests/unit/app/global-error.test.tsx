import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The boundary Next renders when the app itself has failed: the one page that
 * cannot rely on anything else working. It renders its own page, in Finnish,
 * and nothing of Next's.
 *
 * decisions/403-coverage-exclusions-that-earn-it.md
 * decisions/533-finnish-error-pages.md
 */

const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@sentry/nextjs", () => ({ captureException }));

import GlobalError from "@/app/global-error";

afterEach(() => {
  vi.clearAllMocks();
});

// Mounted as the whole document, which is what it is: Next renders it in place
// of the root layout, `<html>` and all. In Testing Library's default `<div>`
// container, an `<html>` makes React warn on every run.
function renderDocument(error: Error) {
  return render(<GlobalError error={error} />, { container: document });
}

const failure = Object.assign(new Error("boom"), { digest: "abc123" });

describe("GlobalError", () => {
  it("mounts without React reporting an error, <html> nesting included", () => {
    // A spy rather than reading the output: local runs do not print a test's
    // console, so the warning showed only in CI's log.
    const consoleError = vi.spyOn(console, "error");

    // Restored in `finally`: a failing assertion would otherwise leave the spy
    // on `console.error` for every later test in the file.
    try {
      renderDocument(failure);

      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("says in Finnish that something went wrong, and that trying again may help", () => {
    renderDocument(failure);

    expect(
      screen.getByRole("heading", { level: 1, name: "Jokin meni vikaan" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sivun lataaminen epäonnistui. Yritä hetken kuluttua uudelleen.")
    ).toBeInTheDocument();
  });

  it("declares the document Finnish, which the layout it replaces would have", () => {
    renderDocument(failure);

    expect(document.documentElement).toHaveAttribute("lang", "fi");
  });

  it("offers the way home as a plain link, so following it loads the app afresh", () => {
    renderDocument(failure);

    expect(screen.getByRole("link", { name: "Etusivulle" })).toHaveAttribute("href", "/");
  });

  it("shows nothing of Next's English default, and no status code or error detail", () => {
    renderDocument(failure);

    const text = document.documentElement.textContent ?? "";
    expect(text).not.toMatch(/application error|exception|error/i);
    // The App Router exposes no status code for an error, and the reader has
    // no use for the message or the digest: those go to Sentry.
    expect(text).not.toMatch(/\b[45]\d\d\b/);
    expect(text).not.toContain("boom");
    expect(text).not.toContain("abc123");
  });

  it("reports the failure to Sentry, digest and all", () => {
    renderDocument(failure);

    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(failure);
  });

  it("reports again when a different error arrives", () => {
    const { rerender } = renderDocument(failure);
    const second = new Error("another");

    rerender(<GlobalError error={second} />);

    // `rerender`, not a second `render`: the effect's dependency is the error,
    // and mounting a fresh component would report a second time whatever the
    // dependency list said — a test that passes with `[error]` deleted.
    expect(captureException).toHaveBeenNthCalledWith(2, second);
  });

  it("does not report twice for the same error", () => {
    const { rerender } = renderDocument(failure);

    rerender(<GlobalError error={failure} />);

    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
