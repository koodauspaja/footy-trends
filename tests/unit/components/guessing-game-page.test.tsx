import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GuessingGamePage } from "@/components/guessing-game-page";
import type { Board, Shares } from "@/lib/guessing-game";
import { placeGuessAction } from "@/lib/guessing-game-actions";
import type { ModelGuess } from "@/lib/guessing-game-models";
import type { GameView, UpcomingMatch } from "@/lib/guessing-game-store";

/**
 * What `/arvauspeli` shows for each state of the game: the way in, between
 * seasons, and a player's balance, matches with their prices, the guesses
 * waiting for a result and what the settled ones paid.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/077-nickname.md
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 */

const NO_SHARES: ReadonlyMap<number, Shares> = new Map();
const NO_MODELS: ReadonlyMap<number, ModelGuess[]> = new Map();

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
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname
        view={{ kind: "not-joined", seasonId: 2027, grant: 1000 }}
      />
    );

    expect(screen.getByText(INTRO)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Liity peliin" })).toBeInTheDocument();
    expect(screen.queryByText(/Kausi on jo alkanut/)).toBeNull();
  });

  it("says what a late joiner gets", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname
        view={{ kind: "not-joined", seasonId: 2027, grant: 564 }}
      />
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname
        view={{ kind: "between", nextSeasonId: 2028, joined: true, awaiting: [] }}
      />
    );
    expect(screen.queryByRole("button")).toBeNull();

    rerender(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname
        view={{ kind: "no-season", joined: true }}
      />
    );
    expect(screen.getByText("Veikkausliigan ottelut julkaistaan myöhemmin.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the balance with its thousands separated, and an empty list of matches", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname
        view={playing()}
      />
    );

    expect(screen.getByText(/^Pelimerkit:/)).toHaveTextContent(/^Pelimerkit: 1\s250$/);
    expect(screen.getByText("Ei tulevia otteluita.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ratkaistut" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Odottavat tulosta" })).toBeNull();
  });

  it("lists upcoming matches by Helsinki date, with the price and when it rises", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
              bonus: 0,
              modelsReward: 0,
            },
            {
              ...base,
              providerMatchId: 2,
              guess: { kind: "score", homeGoals: 3, awayGoals: 2 },
              settlement: "difference",
              reward: 40,
              bonus: 0,
              modelsReward: 0,
            },
            {
              ...base,
              providerMatchId: 3,
              guess: { kind: "outcome", outcome: "1" },
              settlement: "outcome",
              reward: 30,
              bonus: 0,
              modelsReward: 0,
            },
            {
              ...base,
              providerMatchId: 4,
              guess: { kind: "outcome", outcome: "2" },
              settlement: "miss",
              reward: 0,
              bonus: 0,
              modelsReward: 0,
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
              bonus: 0,
              modelsReward: 0,
            },
            {
              ...base,
              providerMatchId: 2,
              homeGoals: 0,
              awayGoals: 1,
              settlement: "miss",
              reward: 0,
              bonus: 0,
              modelsReward: 0,
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
              bonus: 0,
              modelsReward: 0,
            },
            {
              ...base,
              providerMatchId: 2,
              homeGoals: null,
              awayGoals: null,
              settlement: "abandoned",
              reward: 25,
              bonus: 0,
              modelsReward: 0,
            },
            {
              ...base,
              providerMatchId: 3,
              homeGoals: null,
              awayGoals: null,
              settlement: "undecided",
              reward: 10,
              bonus: 0,
              modelsReward: 0,
            },
            {
              ...base,
              providerMatchId: 4,
              homeGoals: null,
              awayGoals: null,
              settlement: "void",
              reward: 30,
              bonus: 0,
              modelsReward: 0,
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
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
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
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname={false}
        view={playing()}
      />
    );

    expect(screen.getByText(LINE)).toHaveTextContent(
      "Valitse nimimerkki, jolla näyt tulostaulukossa."
    );
    expect(screen.getByRole("link", { name: "nimimerkki" })).toHaveAttribute("href", "/asetukset");
  });

  it("is not shown to a player who has one", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname
        view={playing()}
      />
    );

    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it.each<[string, GameView]>([
    ["between seasons", { kind: "between", nextSeasonId: 2028, joined: true, awaiting: [] }],
    ["before any season is stored", { kind: "no-season", joined: true }],
  ])("tells a joined player with none %s too", (_case, view) => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname={false}
        view={view}
      />
    );

    expect(screen.getByRole("link", { name: "nimimerkki" })).toHaveAttribute("href", "/asetukset");
  });

  it("is not shown between seasons to a reader who has not joined, or to one with a nickname", () => {
    const { rerender } = render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname={false}
        view={{ kind: "between", nextSeasonId: 2028, joined: false, awaiting: [] }}
      />
    );
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();

    rerender(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname
        view={{ kind: "between", nextSeasonId: 2028, joined: true, awaiting: [] }}
      />
    );
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it("is not shown to a reader who has not joined", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        shares={NO_SHARES}
        hasNickname={false}
        view={{ kind: "not-joined", seasonId: 2027, grant: 1000 }}
      />
    );

    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });
});

function boardOf(rows: Board["rows"], own: Board["own"] = null, players = rows.length): Board {
  return { rows, own, players };
}

function boardRow(overrides: Partial<Board["rows"][number]> = {}): Board["rows"][number] {
  return {
    nickname: "Aino",
    balance: 1040,
    settled: 3,
    rank: 1,
    place: 1,
    self: false,
    ...overrides,
  };
}

describe("Tulostaulukko", () => {
  it("ranks the players after Tulevat ottelut and before the player's waiting guesses, counting them", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf([
          boardRow(),
          boardRow({ nickname: null, balance: 1000, rank: 2, place: 2, settled: 1 }),
        ])}
        hasNickname
        shares={NO_SHARES}
        view={playing({
          awaiting: [
            {
              providerMatchId: 8,
              kickoffAt: new Date("2027-05-01T15:00:00Z"),
              homeTeamName: "HJK",
              awayTeamName: "KuPS",
              guess: { kind: "outcome", outcome: "1" },
            },
          ],
        })}
      />
    );

    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(headings.slice(0, 3)).toEqual(["Tulevat ottelut", "Tulostaulukko", "Odottavat tulosta"]);
    expect(screen.getByText("(2 pelaajaa)")).toBeInTheDocument();
    // The thousands separator is a no-break space, as `Intl` writes it.
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent?.replaceAll(/\s/g, " "))).toEqual([
      "1.Aino1 0403",
      "2.Nimetön pelaaja1 0001",
    ]);
  });

  it("names the columns", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf([boardRow()])}
        hasNickname
        shares={NO_SHARES}
        view={playing()}
      />
    );

    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Sija",
      "Pelaaja",
      "Pelimerkit",
      "Ratkaistut",
    ]);
  });

  it("marks the reader's own row", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf([boardRow({ self: true })])}
        hasNickname
        shares={NO_SHARES}
        view={playing()}
      />
    );

    const own = screen.getByText("(sinä)").closest("tr");
    expect(own).toHaveTextContent("Aino");
    expect(own).toHaveClass("font-semibold");
  });

  it("shows the reader's row after a gap when it is below the first rows", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf(
          [boardRow()],
          boardRow({ nickname: "Minä", rank: 53, place: 53, self: true }),
          53
        )}
        hasNickname
        shares={NO_SHARES}
        view={playing()}
      />
    );

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((row) => row.textContent?.slice(0, 7))).toEqual(["1.Aino1", "…", "53.Minä"]);
    expect(screen.getByText("(53 pelaajaa)")).toBeInTheDocument();
  });

  it("counts one player in the singular", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf([boardRow()])}
        hasNickname
        shares={NO_SHARES}
        view={playing()}
      />
    );

    expect(screen.getByText("(1 pelaaja)")).toBeInTheDocument();
  });

  it("says nobody has guessed yet on an empty board", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf([])}
        hasNickname
        shares={NO_SHARES}
        view={playing()}
      />
    );

    expect(screen.getByText("Kukaan ei ole vielä arvannut tällä kaudella.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says the board failed when it could not be read, and still shows the game", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board="error"
        hasNickname
        shares={NO_SHARES}
        view={playing()}
      />
    );

    expect(
      screen.getByText("Tulostaulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.")
    ).toBeInTheDocument();
    expect(screen.getByText(/^Pelimerkit:/)).toBeInTheDocument();
  });

  it("shows the board to a reader who has not joined, and between seasons", () => {
    const { rerender } = render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf([boardRow()])}
        hasNickname={false}
        shares={NO_SHARES}
        view={{ kind: "not-joined", seasonId: 2027, grant: 1000 }}
      />
    );
    expect(screen.getByRole("button", { name: "Liity peliin" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tulostaulukko" })).toBeInTheDocument();

    rerender(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={boardOf([boardRow()])}
        hasNickname
        shares={NO_SHARES}
        view={{ kind: "between", nextSeasonId: 2028, joined: true, awaiting: [] }}
      />
    );
    expect(screen.getByRole("heading", { name: "Tulostaulukko" })).toBeInTheDocument();
  });

  it("shows no board before any season is stored", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        hasNickname
        shares={NO_SHARES}
        view={{ kind: "no-season", joined: true }}
      />
    );

    expect(screen.queryByRole("heading", { name: "Tulostaulukko" })).not.toBeInTheDocument();
  });
});

describe("the players' guesses and the rarity bonus", () => {
  const KICKED_OFF = new Date("2027-05-01T15:00:00Z");
  const SHARES = new Map([[8, { "1": 60, X: 25, "2": 15, total: 20 }]]);

  it("shows the shares under a guess waiting for its result", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        hasNickname
        shares={SHARES}
        view={playing({
          awaiting: [
            {
              providerMatchId: 8,
              kickoffAt: KICKED_OFF,
              homeTeamName: "HJK",
              awayTeamName: "KuPS",
              guess: { kind: "outcome", outcome: "1" },
            },
            {
              providerMatchId: 9,
              kickoffAt: KICKED_OFF,
              homeTeamName: "Inter",
              awayTeamName: "Ilves",
              guess: { kind: "outcome", outcome: "X" },
            },
          ],
        })}
      />
    );

    expect(
      screen.getByText("Pelaajien arvaukset: 1 60 % · X 25 % · 2 15 % (20 arvausta)")
    ).toBeInTheDocument();
    // A match with too few guesses has no shares, and no line.
    expect(screen.getAllByText(/^Pelaajien arvaukset/)).toHaveLength(1);
  });

  it("shows the bonus and the shares under a settled guess", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        hasNickname
        shares={SHARES}
        view={playing({
          settled: [
            {
              providerMatchId: 8,
              kickoffAt: KICKED_OFF,
              homeTeamName: "HJK",
              awayTeamName: "KuPS",
              guess: { kind: "outcome", outcome: "2" },
              homeGoals: 0,
              awayGoals: 1,
              settlement: "outcome",
              reward: 30,
              bonus: 20,
              modelsReward: 0,
            },
          ],
        })}
      />
    );

    const item = screen.getByText("HJK 0–1 KuPS").closest("li") as HTMLElement;
    expect([...item.querySelectorAll("p")].map((line) => line.textContent)).toEqual([
      "Arvauksesi: 2",
      "Oikea merkki +30",
      "Harvinainen osuma +20",
      "Pelaajien arvaukset: 1 60 % · X 25 % · 2 15 % (20 arvausta)",
    ]);
  });

  it("shows no bonus line on a guess without one", () => {
    render(
      <GuessingGamePage
        models={NO_MODELS}
        season={null}
        board={null}
        hasNickname
        shares={NO_SHARES}
        view={playing({
          settled: [
            {
              providerMatchId: 8,
              kickoffAt: KICKED_OFF,
              homeTeamName: "HJK",
              awayTeamName: "KuPS",
              guess: { kind: "outcome", outcome: "1" },
              homeGoals: 1,
              awayGoals: 0,
              settlement: "outcome",
              reward: 30,
              bonus: 0,
              modelsReward: 0,
            },
          ],
        })}
      />
    );

    expect(screen.queryByText(/Harvinainen osuma/)).not.toBeInTheDocument();
  });
});

describe("the models' guesses", () => {
  const KICKED_OFF = new Date("2027-05-01T15:00:00Z");
  const MODELS = new Map<number, ModelGuess[]>([
    [
      8,
      [
        { model: "elo-v1", outcome: "1", score: null },
        { model: "elo-form-v1", outcome: "1", score: null },
        { model: "elo-home-v1", outcome: "X", score: null },
        { model: "poisson-v1", outcome: "1", score: { homeGoals: 2, awayGoals: 1 } },
      ],
    ],
  ]);
  const LINE = "Mallit: Elo 1 · Elo + vire 1 · Elo + kotietu X · Poisson 2–1";

  function awaiting(providerMatchId: number) {
    return {
      providerMatchId,
      kickoffAt: KICKED_OFF,
      homeTeamName: "HJK",
      awayTeamName: "KuPS",
      guess: { kind: "outcome", outcome: "2" } as const,
    };
  }

  it("shows them under a guess waiting for its result, by the prediction pages' names", () => {
    render(
      <GuessingGamePage
        board={null}
        hasNickname
        models={MODELS}
        season={null}
        shares={NO_SHARES}
        view={playing({ awaiting: [awaiting(8), awaiting(9)] })}
      />
    );

    expect(screen.getByText(LINE)).toBeInTheDocument();
    // A match no model guessed has no line.
    expect(screen.getAllByText(/^Mallit:/)).toHaveLength(1);
  });

  it("shows them under a settled guess, with what beating them paid", () => {
    render(
      <GuessingGamePage
        board={null}
        hasNickname
        models={MODELS}
        season={null}
        shares={NO_SHARES}
        view={playing({
          settled: [
            {
              ...awaiting(8),
              homeGoals: 0,
              awayGoals: 1,
              settlement: "outcome",
              reward: 30,
              bonus: 0,
              modelsReward: 40,
            },
          ],
        })}
      />
    );

    const item = screen.getByText("HJK 0–1 KuPS").closest("li") as HTMLElement;
    expect([...item.querySelectorAll("p")].map((line) => line.textContent)).toEqual([
      "Arvauksesi: 2",
      "Oikea merkki +30",
      "Voitit mallit +40",
      LINE,
    ]);
  });

  it("shows no reward line on a guess that beat no model", () => {
    render(
      <GuessingGamePage
        board={null}
        hasNickname
        models={MODELS}
        season={null}
        shares={NO_SHARES}
        view={playing({
          settled: [
            {
              ...awaiting(8),
              homeGoals: 1,
              awayGoals: 0,
              settlement: "miss",
              reward: 0,
              bonus: 0,
              modelsReward: 0,
            },
          ],
        })}
      />
    );

    expect(screen.queryByText(/Voitit mallit/)).not.toBeInTheDocument();
  });

  it("shows nothing of the models on a match still to be played", () => {
    render(
      <GuessingGamePage
        board={null}
        hasNickname
        models={MODELS}
        season={null}
        shares={NO_SHARES}
        view={playing({ upcoming: [upcoming({ providerMatchId: 8 })] })}
      />
    );

    expect(screen.queryByText(/^Mallit:/)).not.toBeInTheDocument();
  });
});
