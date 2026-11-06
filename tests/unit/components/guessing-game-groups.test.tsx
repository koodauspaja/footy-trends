import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupPageView, GroupsSection, InviteView } from "@/components/guessing-game-groups";
import { rankBoard } from "@/lib/guessing-game";
import type { GroupMatch, GroupPage } from "@/lib/guessing-game-group-store";

/**
 * Arvauspeli's groups as a reader sees them: `Ryhmät` on `/arvauspeli`, a
 * group's page for a member and for its owner, and the page an invite link
 * opens in each of its states.
 *
 * decisions/078-private-groups.md
 * decisions/079-group-members-guesses.md
 */

vi.mock("@/lib/guessing-game-group-actions", () => ({
  createGroupAction: vi.fn(),
  joinGroupAction: vi.fn(),
  leaveGroupAction: vi.fn(),
  removeMemberAction: vi.fn(),
  renameGroupAction: vi.fn(),
  renewInviteLinkAction: vi.fn(),
  deleteGroupAction: vi.fn(),
}));
vi.mock("@/lib/auth-client", () => ({ signIn: { social: vi.fn() } }));
vi.mock("@/lib/section-choice-actions", () => ({ saveSectionChoiceAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/arvauspeli/liity/x",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GroupsSection", () => {
  it("lists each group with its size and the reader's rank, linking to its page", () => {
    render(
      <GroupsSection
        groups={[
          { groupId: 4, name: "Kaverit", members: 3, rank: 2 },
          { groupId: 6, name: "Työ", members: 1, rank: null },
        ]}
      />
    );
    expect(screen.getByRole("heading", { name: "Ryhmät" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Kaverit" })).toHaveAttribute(
      "href",
      "/arvauspeli/ryhmat/4"
    );
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Kaverit · 3 jäsentä · sijasi 2.");
    expect(items[1]).toHaveTextContent("Työ · 1 jäsen · ei vielä sijaa");
    expect(screen.getByRole("button", { name: "Perusta ryhmä" })).toBeInTheDocument();
  });

  it("invites a player in no group to create one", () => {
    render(<GroupsSection groups={[]} />);
    expect(
      screen.getByText(
        "Et kuulu vielä yhteenkään ryhmään. Perusta ryhmä ja kutsu kaverisi mukaan linkillä."
      )
    ).toBeInTheDocument();
  });

  it("replaces the form with the limit at ten groups", () => {
    const groups = Array.from({ length: 10 }, (_, index) => ({
      groupId: index + 1,
      name: `Ryhmä ${index + 1}`,
      members: 2,
      rank: 1,
    }));
    render(<GroupsSection groups={groups} />);
    expect(screen.getByText("Voit kuulua enintään 10 ryhmään.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Perusta ryhmä" })).toBeNull();
  });

  it("says a failed read in its place", () => {
    render(<GroupsSection groups="error" />);
    expect(
      screen.getByText("Ryhmien lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
  });
});

function group(overrides: Partial<GroupPage> = {}): GroupPage {
  return {
    groupId: 5,
    name: "Kaverit",
    inviteToken: "a".repeat(43),
    isOwner: false,
    members: [
      { membershipId: 1, nickname: "Omistaja", self: false, owner: true },
      { membershipId: 2, nickname: null, self: true, owner: false },
      { membershipId: 3, nickname: "Kolmas", self: false, owner: false },
    ],
    board: rankBoard(
      [
        { userId: "owner", balance: 1100, settled: 2, nickname: "Omistaja" },
        { userId: "me", balance: 990, settled: 1, nickname: null },
      ],
      "me"
    ),
    guesses: null,
    ...overrides,
  };
}

describe("GroupPageView", () => {
  it("shows a member the board, the members, the link and a way out, and no owner's tools", () => {
    render(<GroupPageView shown={10} group={group()} />);
    expect(screen.getByText("3 jäsentä · omistaja Omistaja")).toBeInTheDocument();
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("1.Omistaja1 1002");
    expect(rows[2]).toHaveTextContent("2.Nimetön pelaaja (sinä)9901");
    expect(screen.getByText("1 jäsen ei ole vielä arvannut tällä kaudella.")).toBeInTheDocument();
    const members = screen.getByRole("heading", { name: "Jäsenet" })
      .nextElementSibling as HTMLElement;
    expect(
      within(members)
        .getAllByRole("listitem")
        .map((item) => item.textContent)
    ).toEqual(["Omistaja · omistaja", "Nimetön pelaaja (sinä)", "Kolmas"]);
    expect(
      screen.getByText("Kuka tahansa linkin saanut kirjautunut käyttäjä voi liittyä ryhmään.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poistu ryhmästä" })).toBeInTheDocument();
    for (const name of ["Poista ryhmästä", "Uusi linkki", "Poista ryhmä", "Tallenna nimi"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.getByRole("link", { name: "Takaisin arvauspeliin" })).toHaveAttribute(
      "href",
      "/arvauspeli"
    );
  });

  it("gives the owner a removal on every other member's row, and the owner's tools", () => {
    render(
      <GroupPageView
        shown={10}
        group={group({
          isOwner: true,
          members: [
            { membershipId: 1, nickname: "Omistaja", self: true, owner: true },
            { membershipId: 2, nickname: null, self: false, owner: false },
          ],
        })}
      />
    );
    expect(screen.getAllByRole("button", { name: "Poista ryhmästä" })).toHaveLength(1);
    for (const name of ["Uusi linkki", "Poista ryhmä", "Tallenna nimi", "Poistu ryhmästä"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText(/ei ole vielä arvannut/)).toBeNull();
  });

  it("names an owner without a nickname, and counts the members not yet guessing", () => {
    render(
      <GroupPageView
        shown={10}
        group={group({
          members: [
            { membershipId: 1, nickname: null, self: true, owner: true },
            { membershipId: 2, nickname: "Toinen", self: false, owner: false },
            { membershipId: 3, nickname: "Kolmas", self: false, owner: false },
          ],
          board: rankBoard([], "me"),
        })}
      />
    );
    expect(screen.getByText("3 jäsentä · omistaja Nimetön pelaaja")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("3 jäsentä ei ole vielä arvannut tällä kaudella.")).toBeInTheDocument();
  });

  it("says the season has not begun when there is none to rank", () => {
    render(<GroupPageView shown={10} group={group({ board: null })} />);
    expect(screen.getByText("Kausi ei ole vielä alkanut.")).toBeInTheDocument();
  });
});

describe("Jäsenten arvaukset", () => {
  function played(overrides: Partial<GroupMatch> = {}): GroupMatch {
    return {
      providerMatchId: 7,
      kickoffAt: new Date("2027-05-02T15:00:00Z"),
      homeTeamName: "HJK",
      awayTeamName: "KuPS",
      homeGoals: 2,
      awayGoals: 1,
      models: [{ model: "elo", outcome: "1", score: null }],
      guesses: [
        {
          membershipId: 1,
          nickname: "Omistaja",
          self: false,
          guess: { kind: "outcome", outcome: "1" },
          paid: { settlement: "outcome", reward: 30, bonus: 20, modelsReward: 10 },
        },
        {
          membershipId: 2,
          nickname: null,
          self: true,
          guess: { kind: "score", homeGoals: 0, awayGoals: 0 },
          paid: { settlement: "miss", reward: 0, bonus: 0, modelsReward: 0 },
        },
      ],
      ...overrides,
    };
  }

  function section() {
    return screen.getByRole("heading", { name: "Jäsenten arvaukset" }).parentElement as HTMLElement;
  }

  it("shows each member's guess on a played match, with what it paid, and the models", () => {
    render(
      <GroupPageView shown={10} group={group({ guesses: { matches: [played()], more: false } })} />
    );
    const shown = within(section());
    expect(shown.getByText("Arvaukset näkyvät ottelun alettua.")).toBeInTheDocument();
    expect(shown.getByRole("heading", { level: 3, name: "HJK 2–1 KuPS" })).toBeInTheDocument();
    expect(shown.getByText(/Arvasi 2\/3 jäsentä$/)).toBeInTheDocument();
    const rows = shown.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent(
      "Omistaja: 1Oikea merkki +30Harvinainen osuma +20Voitit mallit +10"
    );
    expect(rows[1]).toHaveTextContent("Nimetön pelaaja (sinä): 0–0Ei osunut");
    expect(shown.getByText("Mallit: elo 1")).toBeInTheDocument();
    expect(shown.queryByRole("link", { name: "Näytä aiemmat ottelut" })).toBeNull();
  });

  it("says a guess still waits, and shows a match not settled without a score", () => {
    const waiting = played({
      homeGoals: null,
      awayGoals: null,
      models: [],
      guesses: [
        {
          membershipId: 1,
          nickname: "Omistaja",
          self: false,
          guess: { kind: "outcome", outcome: "X" },
          paid: null,
        },
      ],
    });
    render(
      <GroupPageView shown={10} group={group({ guesses: { matches: [waiting], more: false } })} />
    );
    const shown = within(section());
    expect(shown.getByRole("heading", { level: 3, name: "HJK – KuPS" })).toBeInTheDocument();
    expect(shown.getByRole("listitem")).toHaveTextContent("Omistaja: XOdottaa tulosta");
    expect(shown.queryByText(/^Mallit:/)).toBeNull();
  });

  it("links to ten more matches when there are more", () => {
    render(
      <GroupPageView shown={20} group={group({ guesses: { matches: [played()], more: true } })} />
    );
    expect(within(section()).getByRole("link", { name: "Näytä aiemmat ottelut" })).toHaveAttribute(
      "href",
      "?ottelut=30"
    );
  });

  it("says when no member has guessed a match that has kicked off", () => {
    render(<GroupPageView shown={10} group={group({ guesses: { matches: [], more: false } })} />);
    expect(
      within(section()).getByText(
        "Kukaan ryhmästä ei ole vielä arvannut alkanutta ottelua tällä kaudella."
      )
    ).toBeInTheDocument();
  });

  it("says a failed read in its place, and keeps the rest of the page", () => {
    render(<GroupPageView shown={10} group={group({ guesses: "error" })} />);
    expect(
      within(section()).getByText(
        "Jäsenten arvausten lataaminen epäonnistui. Yritä myöhemmin uudelleen."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Jäsenet" })).toBeInTheDocument();
  });

  it("is not shown with no season to list", () => {
    render(<GroupPageView shown={10} group={group({ guesses: null })} />);
    expect(screen.queryByRole("heading", { name: "Jäsenten arvaukset" })).toBeNull();
  });
});

describe("InviteView", () => {
  const invite = { groupId: 5, name: "Kaverit", members: 3, member: false, player: true };

  it("says a link that names no group is not valid, and names no group", () => {
    render(<InviteView invite={null} signedIn token="x" />);
    expect(
      screen.getByText("Kutsulinkki ei ole voimassa. Pyydä ryhmän jäseneltä uusi linkki.")
    ).toBeInTheDocument();
  });

  it("asks a signed-out reader to sign in to join the named group", () => {
    render(<InviteView invite={invite} signedIn={false} token="x" />);
    expect(screen.getByText("Kirjaudu sisään liittyäksesi ryhmään Kaverit.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kirjaudu sisään" })).toBeInTheDocument();
  });

  it("offers a player the group", () => {
    render(<InviteView invite={invite} signedIn token="x" />);
    expect(screen.getByText("Sinut on kutsuttu ryhmään Kaverit (3 jäsentä).")).toBeInTheDocument();
    expect(
      screen.getByText("Ryhmän jäsenet näkevät toistensa arvaukset otteluiden alettua.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liity ryhmään" })).toBeInTheDocument();
    expect(screen.queryByText(/Pelimerkkejä ei voi ostaa/)).toBeNull();
  });

  it("offers a reader not yet playing the game and the group in one press", () => {
    render(<InviteView invite={{ ...invite, player: false }} signedIn token="x" />);
    expect(screen.getByText(/Pelimerkkejä ei voi ostaa/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liity peliin ja ryhmään" })).toBeInTheDocument();
  });
});
