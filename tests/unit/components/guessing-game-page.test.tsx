import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuessingGamePage } from "@/components/guessing-game-page";
import { placeGuessAction } from "@/lib/guessing-game-actions";
import type { GameView, UpcomingMatch } from "@/lib/guessing-game-store";

/**
 * What `/arvauspeli` shows for each state of the game: the way in, between
 * seasons, and a player's balance, matches with their prices, the guesses
 * waiting for a result and what the settled ones paid.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/077-nickname.md
 */

vi.mock("@/lib/guessing-game-actions", () => ({
  joinGameAction: vi.fn(),
  placeGuessAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/section-choice-actions", () => ({ saveSectionChoiceAction: vi.fn() }));

const INTRO =
  "Arvaa Veikkausliigan otteluiden tuloksia pelimerkeillä. Pelimerkkejä ei voi ostaa, myydä eikä vaihtaa mihinkään.";

function upcoming(overrides: Partial<UpcomingMatch> = {}): UpcomingMatch {
  return {
    providerMatchId: 1,
    groupName: "Runkosarja",
    kickoffAt: new Date("2027-04-10T15:00:00Z"),
    homeTeamName: "HJK",
    awayTeamName: "KuPS",
    price: 10,
    nextRise: { price: 15, at: new Date("2027-04-03T15:00:00Z") },
    guess: null,
    free: false,
    postponed: false,
    floor: false,
    ...overrides,
  };
}

function playing(overrides: Partial<Extract<GameView, { kind: "playing" }>> = {}): GameView {
  return {
    kind: "playing",
    seasonId: 2027,
    balance: 1250,
    upcoming: [],
    awaiting: [],
    settled: [],
    groups: 1,
    ...overrides,
  };
}

describe("GuessingGamePage", () => {
  it("offers a reader who has not joined the game before its first kickoff, with no share line", () => {
    render(
      <GuessingGamePage hasNickname view={{ kind: "not-joined", seasonId: 2027, grant: 1000 }} />
    );

    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liity peliin" })).toBeInTheDocument();
    expect(screen.queryByText(/Kausi on jo alkanut/)).toBeNull();
  });

  it("says what a late joiner gets", () => {
    render(
      <GuessingGamePage hasNickname view={{ kind: "not-joined", seasonId: 2027, grant: 564 }} />
    );

    expect(
      screen.getByText(
        "Kausi on jo alkanut: saat 564 pelimerkkiä, osuutena jäljellä olevista otteluista."
      )
    ).toBeInTheDocument();
  });

  it("names the next season between seasons, and still lets a reader join", () => {
    render(
      <GuessingGamePage
        hasNickname
        view={{ kind: "between", nextSeasonId: 2028, joined: false, awaiting: [] }}
      />
    );

    expect(screen.getByText("Kauden 2028 ottelut julkaistaan myöhemmin.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liity peliin" })).toBeInTheDocument();
  });

  it("offers a player nothing more to press between seasons, or before any season is stored", () => {
    const { rerender } = render(
      <GuessingGamePage
        hasNickname
        view={{ kind: "between", nextSeasonId: 2028, joined: true, awaiting: [] }}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<GuessingGamePage hasNickname view={{ kind: "no-season", joined: true }} />);
    expect(screen.getByText("Veikkausliigan ottelut julkaistaan myöhemmin.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the balance with its thousands separated, and an empty list of matches", () => {
    render(<GuessingGamePage hasNickname view={playing()} />);

    expect(screen.getByText(/^Pelimerkit:/)).toHaveTextContent(/^Pelimerkit: 1\s250$/);
    expect(screen.getByText("Ei tulevia otteluita.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ratkaistut" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Odottavat tulosta" })).toBeNull();
  });

  it("lists upcoming matches by Helsinki date, with the price and when it rises", () => {
    render(
      <GuessingGamePage
        hasNickname
        view={playing({
          upcoming: [
            upcoming(),
            upcoming({
              providerMatchId: 2,
              homeTeamName: "SJK",
              awayTeamName: "Inter",
              kickoffAt: new Date("2027-04-11T21:30:00Z"),
              price: 30,
              nextRise: null,
            }),
          ],
        })}
      />
    );

    expect(screen.getByRole("heading", { name: "Tulevat ottelut" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "la 10.4.2027" })).toBeInTheDocument();
    // 21.30 UTC is past midnight in Helsinki.
    expect(screen.getByRole("heading", { name: "ma 12.4.2027" })).toBeInTheDocument();
    expect(
      screen.getByText("Hinta nyt 10, nousee 15:een 03.04.2027 klo 18.00")
    ).toBeInTheDocument();
    expect(screen.getByText("Hinta nyt 30")).toBeInTheDocument();
    expect(screen.getByText("klo 18.00")).toBeInTheDocument();
  });

  it("names each match's group only when the list has several", () => {
    render(
      <GuessingGamePage
        hasNickname
        view={playing({
          groups: 2,
          upcoming: [
            upcoming({ groupName: "Mestaruussarja" }),
            upcoming({ providerMatchId: 2, groupName: "Karsintasarja" }),
          ],
        })}
      />
    );

    expect(screen.getAllByText("klo 18.00 · Mestaruussarja")).toHaveLength(1);
    expect(screen.getAllByText("klo 18.00 · Karsintasarja")).toHaveLength(1);
  });

  it("shows a player's guess, the change's price, and the floor's free 1X2", () => {
    render(
      <GuessingGamePage
        hasNickname
        view={playing({
          balance: 5,
          upcoming: [
            upcoming({ guess: { kind: "score", homeGoals: 2, awayGoals: 1 }, nextRise: null }),
            upcoming({ providerMatchId: 2, floor: true }),
            upcoming({ providerMatchId: 3, guess: { kind: "outcome", outcome: "X" }, free: true }),
          ],
        })}
      />
    );

    expect(screen.getByText("Arvauksesi: 2–1")).toBeInTheDocument();
    expect(screen.getByText("Muutos maksaa 10")).toBeInTheDocument();
    expect(screen.getByText("Maksuton 1X2-arvaus")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pelimerkkisi eivät riitä arvaukseen. Voit tehdä yhden maksuttoman 1X2-arvauksen kerrallaan."
      )
    ).toBeInTheDocument();
    expect(screen.getByText("Arvauksesi: X")).toBeInTheDocument();
    expect(screen.getByText("Maksutonta arvausta ei voi muuttaa.")).toBeInTheDocument();
    // The free guess has no form of its own: two forms for three rows.
    expect(screen.getAllByRole("button", { name: /^(Arvaa|Muuta arvausta)$/ })).toHaveLength(2);
  });

  it("lists the guesses waiting for a result, and what each settled one paid", () => {
    const base = {
      kickoffAt: new Date("2027-04-01T15:00:00Z"),
      homeTeamName: "HJK",
      awayTeamName: "KuPS",
      homeGoals: 2,
      awayGoals: 1,
    };
    render(
      <GuessingGamePage
        hasNickname
        view={playing({
          awaiting: [{ ...base, providerMatchId: 9, guess: { kind: "outcome", outcome: "1" } }],
          settled: [
            {
              ...base,
              providerMatchId: 1,
              guess: { kind: "score", homeGoals: 2, awayGoals: 1 },
              settlement: "exact",
              reward: 100,
            },
            {
              ...base,
              providerMatchId: 2,
              guess: { kind: "score", homeGoals: 3, awayGoals: 2 },
              settlement: "difference",
              reward: 40,
            },
            {
              ...base,
              providerMatchId: 3,
              guess: { kind: "outcome", outcome: "1" },
              settlement: "outcome",
              reward: 30,
            },
            {
              ...base,
              providerMatchId: 4,
              guess: { kind: "outcome", outcome: "2" },
              settlement: "miss",
              reward: 0,
            },
          ],
        })}
      />
    );

    const awaiting = screen.getByRole("heading", { name: "Odottavat tulosta" }).closest("section");
    if (awaiting === null) throw new Error("no section");
    expect(within(awaiting).getByText("Arvauksesi: 1")).toBeInTheDocument();
    const settled = screen.getByRole("heading", { name: "Ratkaistut" }).closest("section");
    if (settled === null) throw new Error("no section");
    expect(within(settled).getAllByText("HJK 2–1 KuPS")).toHaveLength(4);
    for (const line of [
      "Oikea tulos +100",
      "Oikea maaliero +40",
      "Oikea merkki +30",
      "Ei osunut",
    ]) {
      expect(within(settled).getByText(line)).toBeInTheDocument();
    }
  });

  it("opens only the upcoming matches; the waiting and settled guesses start closed, each with its count", () => {
    const base = {
      kickoffAt: new Date("2027-04-01T15:00:00Z"),
      homeTeamName: "HJK",
      awayTeamName: "KuPS",
      guess: { kind: "outcome", outcome: "1" } as const,
    };
    render(
      <GuessingGamePage
        hasNickname
        view={playing({
          upcoming: [upcoming()],
          awaiting: [{ ...base, providerMatchId: 9 }],
          settled: [
            {
              ...base,
              providerMatchId: 1,
              homeGoals: 1,
              awayGoals: 0,
              settlement: "outcome",
              reward: 30,
            },
            {
              ...base,
              providerMatchId: 2,
              homeGoals: 0,
              awayGoals: 1,
              settlement: "miss",
              reward: 0,
            },
          ],
        })}
      />
    );

    const fold = (name: string) => screen.getByRole("heading", { name }).closest("details");
    expect(fold("Tulevat ottelut")).toHaveAttribute("open");
    expect(fold("Odottavat tulosta")).not.toHaveAttribute("open");
    expect(fold("Ratkaistut")).not.toHaveAttribute("open");
    expect(screen.getByText("(1 ottelu)")).toBeInTheDocument();
    expect(screen.getByText("(1 arvaus)")).toBeInTheDocument();
    expect(screen.getByText("(2 arvausta)")).toBeInTheDocument();
  });

  it("still lists a player's waiting guesses between seasons", () => {
    render(
      <GuessingGamePage
        hasNickname
        view={{
          kind: "between",
          nextSeasonId: 2028,
          joined: true,
          awaiting: [
            {
              providerMatchId: 9,
              kickoffAt: new Date("2027-11-01T15:00:00Z"),
              homeTeamName: "HJK",
              awayTeamName: "KuPS",
              guess: { kind: "outcome", outcome: "X" },
            },
          ],
        }}
      />
    );

    expect(screen.getByText("Kauden 2028 ottelut julkaistaan myöhemmin.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Odottavat tulosta" })).toBeInTheDocument();
    expect(screen.getByText("Arvauksesi: X")).toBeInTheDocument();
  });

  it("says how each irregular match settled, with no score where none decided it", () => {
    const base = {
      kickoffAt: new Date("2027-04-01T15:00:00Z"),
      homeTeamName: "HJK",
      awayTeamName: "KuPS",
      guess: { kind: "outcome", outcome: "1" } as const,
    };
    render(
      <GuessingGamePage
        hasNickname
        view={playing({
          settled: [
            {
              ...base,
              providerMatchId: 1,
              homeGoals: 3,
              awayGoals: 0,
              settlement: "awarded",
              reward: 30,
            },
            {
              ...base,
              providerMatchId: 2,
              homeGoals: null,
              awayGoals: null,
              settlement: "abandoned",
              reward: 25,
            },
            {
              ...base,
              providerMatchId: 3,
              homeGoals: null,
              awayGoals: null,
              settlement: "undecided",
              reward: 10,
            },
            {
              ...base,
              providerMatchId: 4,
              homeGoals: null,
              awayGoals: null,
              settlement: "void",
              reward: 30,
            },
          ],
        })}
      />
    );

    for (const line of [
      "Ottelu ratkaistiin päätöksellä +30",
      "Ottelu keskeytettiin, pelimerkit palautettu +25",
      "Ottelua ei ratkaistu, pelimerkit palautettu +10",
      "Arvaus tehtiin ottelun alettua, pelimerkit palautettu +30",
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    expect(screen.getByText("HJK 3–0 KuPS")).toBeInTheDocument();
    expect(screen.getAllByText("HJK – KuPS")).toHaveLength(3);
  });

  it("offers a postponed match's one free change, the floor's free guess included, and sends it as free", async () => {
    vi.mocked(placeGuessAction).mockResolvedValue({ ok: true });
    render(
      <GuessingGamePage
        hasNickname
        view={playing({
          upcoming: [
            upcoming({ guess: { kind: "outcome", outcome: "X" }, free: true, postponed: true }),
          ],
        })}
      />
    );

    expect(
      screen.getByText("Ottelu siirtyi. Voit muuttaa arvaustasi kerran maksutta.")
    ).toBeInTheDocument();
    expect(screen.getByText("Muutos on maksuton")).toBeInTheDocument();
    expect(screen.queryByText("Maksutonta arvausta ei voi muuttaa.")).toBeNull();
    expect(screen.queryByRole("radio", { name: "Arvaa tulos" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: "Muuta arvausta" }));

    await waitFor(() =>
      expect(placeGuessAction).toHaveBeenCalledWith(1, { kind: "outcome", outcome: "1" }, 0)
    );
  });
});

describe("the line for a player without a nickname", () => {
  const LINE = /jolla näyt tulostaulukossa\./;

  it("tells a player with none where to choose one", () => {
    render(<GuessingGamePage hasNickname={false} view={playing()} />);

    expect(screen.getByText(LINE)).toHaveTextContent(
      "Valitse nimimerkki, jolla näyt tulostaulukossa."
    );
    expect(screen.getByRole("link", { name: "nimimerkki" })).toHaveAttribute("href", "/asetukset");
  });

  it("is not shown to a player who has one", () => {
    render(<GuessingGamePage hasNickname view={playing()} />);

    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it("is not shown to a reader who has not joined", () => {
    render(
      <GuessingGamePage
        hasNickname={false}
        view={{ kind: "not-joined", seasonId: 2027, grant: 1000 }}
      />
    );

    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });
});
