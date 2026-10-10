import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ALL_DRAWN_MESSAGE,
  DRAWS_LEFT_OUT_NOTE,
  eloGaveText,
  FIRST_SEASON_MESSAGE,
  NO_MATCHES_MESSAGE,
  SeasonSurprisesBody,
  SURPRISES_ERROR_MESSAGE,
  SURPRISES_HEADING,
  SURPRISES_NOTE,
} from "@/components/season-surprises";
import type { SeasonSurprises, Surprise } from "@/lib/surprise";

/**
 * A season's biggest surprises as the panel prints them: each row's parts and
 * link, the line for a season in progress, and the line shown when there is no
 * list.
 *
 * decisions/057-surprise-index.md
 */

function surprise(overrides: Partial<Surprise> = {}): Surprise {
  return {
    providerMatchId: 901,
    kickoffAt: new Date("2025-04-21T14:00:00Z"),
    homeTeamProviderId: 10,
    homeTeamName: "Ilves",
    awayTeamProviderId: 20,
    awayTeamName: "HJK",
    homeGoals: 3,
    awayGoals: 0,
    home: 0.06,
    draw: 0.25,
    away: 0.69,
    probability: 0.06,
    ...overrides,
  };
}

const LINE = "Kausi 2025 (kesken)";

function renderBody(surprises: SeasonSurprises, kind: "football-data" | "taso" = "taso") {
  return render(<SeasonSurprisesBody inProgressLine={LINE} kind={kind} surprises={surprises} />);
}

describe("the strings the spec agreed", () => {
  it("are Finnish, as written", () => {
    expect(SURPRISES_HEADING).toBe("Kauden suurimmat yllätykset");
    expect(SURPRISES_NOTE).toBe(
      "Yllätys on sitä suurempi, mitä pienemmän todennäköisyyden Elo antoi toteutuneelle tulokselle ennen ottelua."
    );
    expect(DRAWS_LEFT_OUT_NOTE).toBe(
      "Tasapelit eivät ole mukana: Elo antaa tasapelille saman todennäköisyyden jokaisessa kilpailun ottelussa."
    );
    expect(FIRST_SEASON_MESSAGE).toBe(
      "Kilpailun ensimmäiseltä tallennetulta kaudelta ei näytetä yllätyksiä: Elolla ei ole silloin vielä aiempia otteluita, joihin nojata."
    );
    expect(NO_MATCHES_MESSAGE).toBe("Kaudelta ei ole vielä pelattuja otteluita.");
    expect(ALL_DRAWN_MESSAGE).toBe("Kauden ottelut ovat toistaiseksi päättyneet tasan.");
    expect(SURPRISES_ERROR_MESSAGE).toBe("Yllätyksiä ei voitu laskea. Yritä myöhemmin uudelleen.");
  });

  it("prints a probability as a whole percent", () => {
    expect(eloGaveText(0.064)).toBe("Elo antoi 6\u00a0%");
    expect(eloGaveText(0.225)).toBe("Elo antoi 23\u00a0%");
  });
});

describe("SeasonSurprisesBody", () => {
  it("prints the date, the match, the score and Elo's probability", () => {
    renderBody({ status: "ok", inProgress: false, surprises: [surprise()] });

    expect(screen.getByRole("listitem").textContent).toBe(
      "21.04.2025 · Ilves – HJK 3–0 · Elo antoi 6\u00a0%"
    );
  });

  it("links the match, and only the match, to its page", () => {
    renderBody({ status: "ok", inProgress: false, surprises: [surprise()] });

    const link = screen.getByRole("link");
    expect(link).toHaveTextContent(/^Ilves – HJK$/);
    expect(link).toHaveAttribute("href", "/kotimaa/ottelu/901");
  });

  it("links a football-data match under /ulkomaat", () => {
    renderBody({ status: "ok", inProgress: false, surprises: [surprise()] }, "football-data");

    expect(screen.getByRole("link")).toHaveAttribute("href", "/ulkomaat/ottelu/901");
  });

  it("numbers the list in the order given", () => {
    renderBody({
      status: "ok",
      inProgress: false,
      surprises: [
        surprise({ providerMatchId: 2, homeTeamName: "KuPS" }),
        surprise({ providerMatchId: 1, homeTeamName: "VPS" }),
      ],
    });

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(
      within(list)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual(["KuPS – HJK", "VPS – HJK"]);
  });

  it("explains the measure, and that draws are left out, under the list", () => {
    renderBody({ status: "ok", inProgress: false, surprises: [surprise()] });

    expect(screen.getByText(SURPRISES_NOTE)).toBeInTheDocument();
    expect(screen.getByText(DRAWS_LEFT_OUT_NOTE)).toBeInTheDocument();
  });

  it("names the season above the list only while it is being played", () => {
    const { unmount } = renderBody({ status: "ok", inProgress: true, surprises: [surprise()] });
    expect(screen.getByText(LINE)).toBeInTheDocument();
    unmount();

    renderBody({ status: "ok", inProgress: false, surprises: [surprise()] });
    expect(screen.queryByText(LINE)).not.toBeInTheDocument();
  });

  it.each([
    [{ status: "first-season" }, FIRST_SEASON_MESSAGE],
    [{ status: "empty", inProgress: false }, NO_MATCHES_MESSAGE],
    [{ status: "all-drawn", inProgress: false }, ALL_DRAWN_MESSAGE],
    [{ status: "error" }, SURPRISES_ERROR_MESSAGE],
  ] as const)("shows its own line and no list for %o", (surprises, message) => {
    const { container } = renderBody(surprises);

    expect(container.textContent).toBe(message);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it.each([
    ["empty", NO_MATCHES_MESSAGE],
    ["all-drawn", ALL_DRAWN_MESSAGE],
  ] as const)("names a season in progress above the %s line too", (status, message) => {
    const { container } = renderBody({ status, inProgress: true });

    expect(container.textContent).toBe(`${LINE}${message}`);
  });
});
