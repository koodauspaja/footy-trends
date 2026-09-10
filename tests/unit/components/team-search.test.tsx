import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamSearch } from "@/components/team-search";

/**
 * The search field, from specs/027-team-search.md.
 *
 * `@/lib/auth-client` is mocked because the real client opens a broadcast
 * channel whose cleanup runs after this file's jsdom is gone — see the note in
 * `favourite-toggle.tsx`.
 */
const { sessionState, searchTeamsAction } = vi.hoisted(() => ({
  sessionState: { current: { data: null as unknown } },
  searchTeamsAction: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({ useSession: () => sessionState.current }));
vi.mock("@/lib/team-search-actions", () => ({ searchTeamsAction }));

const team = (over: Partial<Record<string, unknown>> = {}) => ({
  source: "taso",
  teamProviderId: 7,
  name: "FC Honka",
  region: "kotimaa",
  competitionName: "Veikkausliiga",
  seasonId: 2019,
  ...over,
});

function signedIn() {
  sessionState.current = { data: { user: { name: "Miikka" } } };
}

async function search(term = "honka") {
  render(<TeamSearch />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: term } });
  fireEvent.submit(screen.getByRole("searchbox"));
}

beforeEach(() => {
  searchTeamsAction.mockReset();
  searchTeamsAction.mockResolvedValue({ ok: true, teams: [] });
  sessionState.current = { data: null };
});

describe("TeamSearch", () => {
  it("renders nothing at all for a signed-out reader", () => {
    // Not an empty field, and not one that refuses on submit: #247 asks for the
    // search not to be offered.
    const { container } = render(<TeamSearch />);

    expect(container).toBeEmptyDOMElement();
  });

  it("offers the field to a signed-in reader", () => {
    signedIn();

    render(<TeamSearch />);

    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("shows the Finnish empty state when nothing matched", async () => {
    signedIn();
    await search("zzzz");

    expect(await screen.findByText("Ei hakutuloksia.")).toBeInTheDocument();
  });

  it("asks for another character when the term is too short", async () => {
    signedIn();
    searchTeamsAction.mockResolvedValue({ ok: false, reason: "too-short" });
    await search("a");

    expect(await screen.findByText("Kirjoita vähintään kaksi merkkiä.")).toBeInTheDocument();
  });

  it("says the search failed when it did", async () => {
    signedIn();
    searchTeamsAction.mockResolvedValue({ ok: false, reason: "failed" });
    await search();

    expect(await screen.findByText("Haku epäonnistui. Yritä uudelleen.")).toBeInTheDocument();
  });

  it("says the search failed when the action itself rejects", async () => {
    // A refused invocation is the same as a failed one from here.
    signedIn();
    searchTeamsAction.mockRejectedValue(new Error("network"));
    await search();

    expect(await screen.findByText("Haku epäonnistui. Yritä uudelleen.")).toBeInTheDocument();
  });

  it("tells an expired session to try again rather than showing nothing", async () => {
    signedIn();
    searchTeamsAction.mockResolvedValue({ ok: false, reason: "unauthenticated" });
    await search();

    expect(await screen.findByText("Haku epäonnistui. Yritä uudelleen.")).toBeInTheDocument();
  });

  it("links a result to that team's page", async () => {
    signedIn();
    searchTeamsAction.mockResolvedValue({ ok: true, teams: [team()] });
    await search();

    expect(await screen.findByRole("link", { name: "FC Honka" })).toHaveAttribute(
      "href",
      "/kotimaa/joukkue/7"
    );
  });

  it("names the competition and season, which is what tells two teams apart", async () => {
    // `FC Honka` is nine different teams; the name alone cannot distinguish them.
    signedIn();
    searchTeamsAction.mockResolvedValue({
      ok: true,
      teams: [
        team({ teamProviderId: 7, seasonId: 2019 }),
        team({ teamProviderId: 8, competitionName: "Kolmonen", seasonId: 2025 }),
      ],
    });
    await search();

    expect(await screen.findByText("Veikkausliiga · 2019")).toBeInTheDocument();
    expect(screen.getByText("Kolmonen · 2025")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "FC Honka" })).toHaveLength(2);
  });

  it("shows a team with no page as plain text rather than a broken link", async () => {
    // A TASO national side has no team page at all.
    signedIn();
    searchTeamsAction.mockResolvedValue({
      ok: true,
      teams: [team({ name: "Suomi", region: null, competitionName: null, seasonId: 2026 })],
    });
    await search("suomi");

    expect(await screen.findByText("Suomi")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Suomi" })).not.toBeInTheDocument();
  });

  it.each([
    ["neither a competition nor a season", { competitionName: null, seasonId: null }, null],
    ["only a season", { competitionName: null, seasonId: 2026 }, "2026"],
    ["only a competition", { competitionName: "Veikkausliiga", seasonId: null }, "Veikkausliiga"],
  ])("omits rather than pads the second line with %s", async (_case, over, expected) => {
    signedIn();
    searchTeamsAction.mockResolvedValue({ ok: true, teams: [team(over)] });
    await search();

    await screen.findByText("FC Honka");
    if (expected === null) {
      expect(screen.queryByText(/·/)).not.toBeInTheDocument();
    } else {
      expect(screen.getByText(expected)).toBeInTheDocument();
    }
  });

  it("clears a previous message when a new search starts", async () => {
    // A stale `Ei hakutuloksia.` under fresh results would contradict them.
    signedIn();
    await search("zzzz");
    await screen.findByText("Ei hakutuloksia.");

    searchTeamsAction.mockResolvedValue({ ok: true, teams: [team()] });
    fireEvent.submit(screen.getByRole("searchbox"));

    await waitFor(() => expect(screen.queryByText("Ei hakutuloksia.")).not.toBeInTheDocument());
  });

  it("gives the result list a Finnish landmark", async () => {
    signedIn();
    searchTeamsAction.mockResolvedValue({ ok: true, teams: [team()] });
    await search();

    expect(await screen.findByRole("list", { name: "Hakutulokset" })).toBeInTheDocument();
  });
});
