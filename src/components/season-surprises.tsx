import { percentText } from "@/components/charts/line-chart";
import { matchDateFormatter } from "@/components/match-list-table";
import { RowLink } from "@/components/row-link";
import { teamDisplayName } from "@/lib/match-detail";
import type { MatchSource } from "@/lib/match-source";
import { formatMatchResult } from "@/lib/standings";
import type { SeasonSurprises, Surprise } from "@/lib/surprise";

/**
 * The panel's strings.
 *
 * decisions/057-surprise-index.md
 */
export const SURPRISES_HEADING = "Kauden suurimmat yllätykset";
export const SURPRISES_NOTE =
  "Yllätys on sitä suurempi, mitä pienemmän todennäköisyyden Elo antoi toteutuneelle tulokselle ennen ottelua.";
export const DRAWS_LEFT_OUT_NOTE =
  "Tasapelit eivät ole mukana: Elo antaa tasapelille saman todennäköisyyden jokaisessa kilpailun ottelussa.";
export const FIRST_SEASON_MESSAGE =
  "Kilpailun ensimmäiseltä tallennetulta kaudelta ei näytetä yllätyksiä: kilpailusta ei ole silloin vielä aiempia otteluita, joihin ennuste nojaisi.";
export const NO_MATCHES_MESSAGE = "Kaudelta ei ole vielä pelattuja otteluita.";
export const UNPREDICTED_MESSAGE = "Pelatuille otteluille ei ole vielä laskettu ennusteita.";
export const ALL_DRAWN_MESSAGE = "Kauden ottelut ovat toistaiseksi päättyneet tasan.";
export const SURPRISES_ERROR_MESSAGE = "Yllätyksiä ei voitu laskea. Yritä myöhemmin uudelleen.";

/**
 * Where each provider's covered competitions keep their match pages.
 *
 * decisions/057-surprise-index.md
 */
const MATCH_BASE_PATH: Record<MatchSource["kind"], string> = {
  "football-data": "/ulkomaat",
  taso: "/kotimaa",
};

/**
 * `Elo antoi 6 %`: the probability Elo gave a result, as the list prints it.
 *
 * decisions/057-surprise-index.md
 */
export function eloGaveText(probability: number): string {
  return `Elo antoi ${percentText(probability * 100)}`;
}

function SurpriseItem({
  surprise,
  kind,
}: Readonly<{ surprise: Surprise; kind: MatchSource["kind"] }>) {
  const home = teamDisplayName(surprise.homeTeamProviderId, surprise.homeTeamName);
  const away = teamDisplayName(surprise.awayTeamProviderId, surprise.awayTeamName);
  return (
    <li>
      {matchDateFormatter.format(surprise.kickoffAt)}
      {" · "}
      <RowLink
        className="hover:underline"
        href={`${MATCH_BASE_PATH[kind]}/ottelu/${surprise.providerMatchId}`}
      >
        {home} – {away}
      </RowLink>{" "}
      {formatMatchResult(surprise.homeGoals, surprise.awayGoals)}
      {" · "}
      {eloGaveText(surprise.probability)}
    </li>
  );
}

/**
 * The line a season that has no list, and is neither the first stored season
 * nor a failed read, says by why it has none.
 *
 * decisions/057-surprise-index.md
 * decisions/702-surprises-without-backtest.md
 */
const EMPTY_LINES: Record<
  Exclude<SeasonSurprises["status"], "ok" | "first-season" | "error">,
  string
> = {
  empty: NO_MATCHES_MESSAGE,
  unpredicted: UNPREDICTED_MESSAGE,
  "all-drawn": ALL_DRAWN_MESSAGE,
};

/**
 * A season's biggest surprises: a numbered list of the wins Elo thought least
 * likely, each linking to its match, or the line saying why there is none.
 * `inProgressLine` names the season, and is shown while it is being played:
 * above the list, the no-matches line, the unpredicted line and the all-drawn
 * line.
 *
 * decisions/057-surprise-index.md
 * decisions/702-surprises-without-backtest.md
 */
export function SeasonSurprisesBody({
  surprises,
  kind,
  inProgressLine,
}: Readonly<{ surprises: SeasonSurprises; kind: MatchSource["kind"]; inProgressLine: string }>) {
  if (surprises.status === "error") return <p>{SURPRISES_ERROR_MESSAGE}</p>;
  if (surprises.status === "first-season") return <p>{FIRST_SEASON_MESSAGE}</p>;

  const season = surprises.inProgress ? <p className="mb-2 text-sm">{inProgressLine}</p> : null;
  if (surprises.status !== "ok") {
    return (
      <div>
        {season}
        <p>{EMPTY_LINES[surprises.status]}</p>
      </div>
    );
  }

  return (
    <div>
      {season}
      <ol className="list-decimal space-y-1 pl-6 text-sm">
        {surprises.surprises.map((surprise) => (
          <SurpriseItem key={surprise.providerMatchId} kind={kind} surprise={surprise} />
        ))}
      </ol>
      <p className="mt-2 text-muted text-sm">{SURPRISES_NOTE}</p>
      <p className="mt-2 text-muted text-sm">{DRAWS_LEFT_OUT_NOTE}</p>
    </div>
  );
}
