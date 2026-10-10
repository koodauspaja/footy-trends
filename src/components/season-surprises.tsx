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
  "Kilpailun ensimmäiseltä tallennetulta kaudelta ei näytetä yllätyksiä: Elolla ei ole silloin vielä aiempia otteluita, joihin nojata.";
export const NO_MATCHES_MESSAGE = "Kaudelta ei ole vielä pelattuja otteluita.";
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
 * A season's biggest surprises: a numbered list of the wins Elo thought least
 * likely, each linking to its match, or the line saying why there is none.
 * `inProgressLine` names the season, and is shown above either while the
 * season is being played.
 *
 * decisions/057-surprise-index.md
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
        <p>{surprises.status === "empty" ? NO_MATCHES_MESSAGE : ALL_DRAWN_MESSAGE}</p>
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
