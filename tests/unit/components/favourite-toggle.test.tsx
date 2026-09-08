import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FavouriteToggle } from "@/components/favourite-toggle";

/**
 * The one star, from specs/026-favourites.md.
 *
 * It renders in a standings row, on a team page, on a competition page and in
 * the region picker — and the picker is on the four pages #182 keeps
 * prerendered. So it reads the session the browser already has rather than
 * asking the server, and these tests are mostly about what it does when that
 * answer and the truth disagree.
 */
const { session, refetch, toggleTeam, toggleCompetition } = vi.hoisted(() => ({
  session: { data: null as unknown },
  refetch: vi.fn(async () => {}),
  toggleTeam:
    vi.fn<
      (
        source: string,
        id: number
      ) => Promise<{ ok: true; favorite: boolean } | { ok: false; reason: "limit" | "failed" }>
    >(),
  toggleCompetition:
    vi.fn<
      (
        region: string,
        code: string
      ) => Promise<{ ok: true; favorite: boolean } | { ok: false; reason: "limit" | "failed" }>
    >(),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: session.data, refetch }),
}));
vi.mock("@/lib/favourite-actions", () => ({
  toggleFavouriteTeamAction: toggleTeam,
  toggleFavouriteCompetitionAction: toggleCompetition,
}));

const signedIn = (extras: Record<string, unknown> = {}) => {
  session.data = { user: { id: "user-1" }, ...extras };
};

const team = () => (
  <FavouriteToggle kind="team" name="Ilves" source="taso" teamProviderId={60731} />
);

const add = () => screen.getByRole("button", { name: "Lisää suosikkeihin: Ilves" });
const remove = () => screen.getByRole("button", { name: "Poista suosikeista: Ilves" });

beforeEach(() => {
  vi.clearAllMocks();
  session.data = null;
  toggleTeam.mockResolvedValue({ ok: true, favorite: true });
  toggleCompetition.mockResolvedValue({ ok: true, favorite: true });
});

describe("signed out", () => {
  it("renders nothing at all", () => {
    // Not a disabled star: on the picker pages this is the difference between
    // an empty control on every row and no control, and #024 already has one
    // place that asks people to sign in.
    const { container } = render(team());

    expect(container).toBeEmptyDOMElement();
  });
});

describe("reading the session", () => {
  it("shows an empty star for a team that is not a favourite", () => {
    signedIn({ favoriteTeams: ["taso:60999"] });
    render(team());

    expect(add()).toHaveAttribute("aria-pressed", "false");
    expect(add()).toHaveTextContent("☆");
  });

  it("shows a filled star for one that is", () => {
    signedIn({ favoriteTeams: ["taso:60731"] });
    render(team());

    expect(remove()).toHaveAttribute("aria-pressed", "true");
    expect(remove()).toHaveTextContent("★");
  });

  it("does not confuse the two providers' ids", () => {
    // The whole reason a favourite carries a source: 317 is a club in both.
    signedIn({ favoriteTeams: ["football-data:60731"] });
    render(team());

    expect(add()).toHaveAttribute("aria-pressed", "false");
  });

  it("reads competitions from their own list", () => {
    signedIn({ favoriteTeams: ["kotimaa:VL"], favoriteCompetitions: ["kotimaa:VL"] });
    render(<FavouriteToggle code="VL" kind="competition" name="Veikkausliiga" region="kotimaa" />);

    expect(
      screen.getByRole("button", { name: "Poista suosikeista: Veikkausliiga" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("names the thing in the label, because a standings table has twenty stars", () => {
    signedIn();
    render(team());

    expect(screen.getByRole("button", { name: /Ilves$/ })).toBeInTheDocument();
  });
});

describe("writing", () => {
  it("adds, and asks the session to catch up", async () => {
    signedIn();
    render(team());

    fireEvent.click(add());

    await waitFor(() => expect(remove()).toHaveAttribute("aria-pressed", "true"));
    expect(toggleTeam).toHaveBeenCalledWith("taso", 60731);
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("removes", async () => {
    signedIn({ favoriteTeams: ["taso:60731"] });
    toggleTeam.mockResolvedValue({ ok: true, favorite: false });
    render(team());

    fireEvent.click(remove());

    await waitFor(() => expect(add()).toHaveAttribute("aria-pressed", "false"));
  });

  it("keeps its own answer even while the session still says otherwise", async () => {
    // The session is refetched, not instantly updated. Without local state the
    // star springs back for a moment, which reads as the write having failed.
    signedIn({ favoriteTeams: [] });
    render(team());

    fireEvent.click(add());

    await waitFor(() => expect(remove()).toBeInTheDocument());
  });

  it("sends a competition to the competition action", async () => {
    signedIn();
    render(<FavouriteToggle code="VL" kind="competition" name="Veikkausliiga" region="kotimaa" />);

    fireEvent.click(screen.getByRole("button", { name: "Lisää suosikkeihin: Veikkausliiga" }));

    await waitFor(() => expect(toggleCompetition).toHaveBeenCalledWith("kotimaa", "VL"));
    expect(toggleTeam).not.toHaveBeenCalled();
  });
});

describe("when the write does not happen", () => {
  it("says which limit was met, and leaves the star alone", async () => {
    toggleTeam.mockResolvedValue({ ok: false, reason: "limit" });
    signedIn();
    render(team());

    fireEvent.click(add());

    await waitFor(() =>
      expect(screen.getByText("Suosikkeja voi olla enintään 50.")).toBeInTheDocument()
    );
    expect(add()).toHaveAttribute("aria-pressed", "false");
    expect(refetch).not.toHaveBeenCalled();
  });

  it("clears an old limit notice on the next attempt", async () => {
    toggleTeam.mockResolvedValue({ ok: false, reason: "limit" });
    signedIn();
    render(team());
    fireEvent.click(add());
    await waitFor(() => expect(screen.getByText(/enintään 50/)).toBeInTheDocument());
    // The notice renders from inside the transition, while the star is still
    // disabled; clicking before then would do nothing at all.
    await waitFor(() => expect(add()).not.toBeDisabled());

    toggleTeam.mockResolvedValue({ ok: true, favorite: true });
    fireEvent.click(add());

    await waitFor(() => expect(screen.queryByText(/enintään 50/)).not.toBeInTheDocument());
  });

  it("reports the state it still believes when the action fails", async () => {
    // Showing a filled star for a write that did not happen would be a lie the
    // reader only discovers on the favourites page.
    toggleTeam.mockResolvedValue({ ok: false, reason: "failed" });
    signedIn();
    render(team());

    fireEvent.click(add());

    await waitFor(() => expect(toggleTeam).toHaveBeenCalled());
    expect(add()).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText(/enintään 50/)).not.toBeInTheDocument();
  });

  it("survives a rejected invocation", async () => {
    toggleTeam.mockRejectedValue(new Error("network"));
    signedIn();
    render(team());

    fireEvent.click(add());

    await waitFor(() => expect(toggleTeam).toHaveBeenCalled());
    expect(add()).toHaveAttribute("aria-pressed", "false");
  });

  it("survives a refetch that rejects, having already written", async () => {
    refetch.mockRejectedValue(new Error("offline"));
    signedIn();
    render(team());

    fireEvent.click(add());

    await waitFor(() => expect(refetch).toHaveBeenCalled());
    // The write succeeded; only the catching-up failed, so the star keeps the
    // answer the server gave.
    expect(remove()).toHaveAttribute("aria-pressed", "true");
  });
});

describe("an unusable session payload", () => {
  it("is an empty list rather than a crash", () => {
    signedIn({ favoriteTeams: "taso:60731" });
    render(team());

    expect(add()).toBeInTheDocument();
  });
});

describe("hydration", () => {
  it("renders nothing on the server, even for a signed-in reader", async () => {
    /**
     * The star appears on pages that are server-rendered, four of them
     * prerendered (#182). If the first client render disagreed with that HTML,
     * React would throw the server's markup away and re-render the page —
     * which is what it did before the mount gate, because better-auth answers
     * from its own cache on the first render.
     */
    const { renderToStaticMarkup } = await import("react-dom/server");
    signedIn({ favoriteTeams: ["taso:60731"] });

    expect(renderToStaticMarkup(team())).toBe("");
  });
});
