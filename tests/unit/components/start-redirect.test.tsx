import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartRedirect } from "@/components/start-redirect";

const { sessionState, searchParams, replace } = vi.hoisted(() => ({
  sessionState: { current: { data: null as unknown, isPending: false } },
  searchParams: { current: new URLSearchParams() },
  replace: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ useSession: () => sessionState.current }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams.current,
}));

function signedInWith(defaultRegion: unknown) {
  sessionState.current = { data: { user: { name: "Matti" }, defaultRegion }, isPending: false };
}

beforeEach(() => {
  replace.mockClear();
  searchParams.current = new URLSearchParams();
  sessionState.current = { data: null, isPending: false };
});

describe("StartRedirect", () => {
  it("sends a reader with a start page straight to it", () => {
    signedInWith("kotimaa");

    render(<StartRedirect />);

    // `replace`, not `push`: the front page must not become a step the reader
    // has to click past twice on the way back.
    expect(replace).toHaveBeenCalledWith("/kotimaa");
  });

  it("does nothing for a signed-out reader", () => {
    render(<StartRedirect />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("waits rather than redirecting while the session is loading", () => {
    sessionState.current = { data: null, isPending: true };

    render(<StartRedirect />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("does nothing when the reader chose no start page", () => {
    signedInWith(null);

    render(<StartRedirect />);

    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["a region that no longer exists", "eurooppa"],
    ["an English folder name", "domestic"],
    ["a prototype key", "__proto__"],
  ])("refuses to redirect on %s", (_case, stored) => {
    // The value arrives from the session payload as `unknown`. Redirecting to
    // an unvalidated segment would send the reader to a 404 they cannot escape.
    signedInWith(stored);

    render(<StartRedirect />);

    expect(replace).not.toHaveBeenCalled();
  });

  it("never redirects when the picker was asked for explicitly", () => {
    // The escape hatch. Without it a reader with a start page could not reach
    // the region picker by clicking at all.
    signedInWith("kotimaa");
    searchParams.current = new URLSearchParams({ valitse: "1" });

    render(<StartRedirect />);

    expect(replace).not.toHaveBeenCalled();
  });
});
