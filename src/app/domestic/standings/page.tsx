import type { Metadata } from "next";
import Link from "next/link";
import { BracketTree } from "@/components/cup-bracket";
import { MatchListTable } from "@/components/match-list-table";
import { Notice } from "@/components/notice";
import { PageShell } from "@/components/page-shell";
import { RenamedNotice } from "@/components/renamed-notice";
import { StandingsLegend, StandingsTable } from "@/components/standings-table";
import { TasoStandingsControls } from "@/components/taso-standings-controls";
import { buildCupBracket, normaliseRoundName } from "@/lib/cup-rounds";
import { isDomesticCup } from "@/lib/domestic-competitions";
import { resolveDomesticPageContext } from "@/lib/domestic-page-context";
import {
  type GroupStandingsResult,
  getSeasonStandings,
  listSeasonRounds,
  parseTasoRoundParam,
} from "@/lib/taso-standings-service";

export const dynamic = "force-dynamic";

const ERROR_MESSAGE = "Sarjataulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const EMPTY_MESSAGE = "Sarjataulukkoa ei ole saatavilla.";
const INVALID_ROUND_MESSAGE = "Kierrosta ei löytynyt. Näytetään koko kausi.";
const NO_MATCHES_MESSAGE = "Otteluita ei ole saatavilla.";
/**
 * Shown under a group whose own-calculated table did not reproduce TASO's
 * published points, so TASO's numbers are rendered instead. Naming
 * Palloliitto rather than "TASO" because that is the name a reader knows.
 */
const TASO_FALLBACK_MESSAGE =
  "Näytetään Palloliiton omat pisteet: ne poikkeavat otteluista lasketuista. " +
  "Kierrosvalitsin ei ole käytössä tässä ryhmässä.";

type DomesticStandingsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * TASO's own `group_name` for 2015/2018's single (pre-split) group is
 * literally the string `"1"` — displayed as "Runkosarja" per domain
 * knowledge, since that was the era's name for the season's only phase.
 * See specs/009-veikkausliiga.md's Edge Cases.
 */
function displayGroupName(groupName: string): string {
  if (groupName === "1") return "Runkosarja";
  // Cup rounds additionally normalise the two names TASO spells differently
  // across eras — see specs/015-finnish-cups.md. A league group name is never
  // one of them, so this is safe to apply to every group.
  return normaliseRoundName(groupName);
}

const KNOCKOUT_HEADING = "Pudotuspelit";

/**
 * One group's body. A group with no table renders as its matches — a knockout
 * group, where TASO returns one row per bracket slot so an advancing team
 * would repeat itself down the rows (specs/010-playoff-group-match-list.md),
 * or a group TASO lists with no teams at all.
 *
 * A pass-through group additionally carries a notice: its numbers are TASO's,
 * not ours, because the two disagreed. See
 * specs/013-more-finnish-competitions.md.
 */
function GroupBody({
  group,
  teamHref,
  isCup,
}: Readonly<{
  group: GroupStandingsResult;
  teamHref: (teamProviderId: number) => string;
  /** A cup round drops the `Kierros` column — see the render below. */
  isCup: boolean;
}>) {
  if (group.kind !== "match-list") {
    return (
      <>
        {group.kind === "pass-through" && <Notice>{TASO_FALLBACK_MESSAGE}</Notice>}
        <StandingsTable standings={group.standings} teamHref={teamHref} />
      </>
    );
  }

  if (group.matches.length === 0) {
    return <p>{NO_MATCHES_MESSAGE}</p>;
  }

  // A cup round is one round by definition, and the heading directly above
  // already names it — a `Kierros` column would repeat the same value down
  // every row. A league's playoff group can span rounds, so it keeps the
  // column (specs/010-playoff-group-match-list.md).
  if (isCup) {
    return (
      <MatchListTable
        matches={group.matches}
        matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
        teamHref={teamHref}
      />
    );
  }

  return (
    <MatchListTable
      matches={group.matches}
      matchHref={(match) => `/kotimaa/ottelu/${match.providerMatchId}`}
      teamHref={teamHref}
      fourthColumn={{ header: "Kierros", render: (match) => match.matchday ?? "–" }}
    />
  );
}

/**
 * One round, collapsible.
 *
 * A cup season stacks up to ten rounds on one page and the opening round can
 * be 248 teams — nearly 30,000px tall on a phone. `<details>` lets a reader
 * fold one away without any client-side state, and every round starts open so
 * nothing is hidden by default.
 */
function CupRoundSection({
  group,
  teamHref,
}: Readonly<{
  group: GroupStandingsResult;
  teamHref: (teamProviderId: number) => string;
}>) {
  return (
    <details className="mb-10 border-zinc-200 border-b pb-4" open>
      <summary className="mb-3 cursor-pointer list-none">
        <h2 className="inline font-semibold text-xl">{displayGroupName(group.groupName)}</h2>
        {group.kind === "match-list" && (
          <span className="ml-2 text-sm text-zinc-500">{`(${group.matches.length} ottelua)`}</span>
        )}
      </summary>
      <GroupBody group={group} isCup teamHref={teamHref} />
    </details>
  );
}

export async function generateMetadata({
  searchParams,
}: DomesticStandingsPageProps): Promise<Metadata> {
  const params = (await searchParams) ?? {};
  const resolved = await resolveDomesticPageContext(params);
  return { title: `${resolved.seasonCompetitionName} ${resolved.seasonLabel}` };
}

export default async function DomesticStandingsPage({
  searchParams,
}: Readonly<DomesticStandingsPageProps>) {
  const params = (await searchParams) ?? {};
  const {
    competitionCode,
    competitionParam,
    competitionName,
    selectableSeasons,
    season,
    seasonId,
    seasonLabel,
    competitionId,
    categoryId,
    currentSeason,
    seasonCompetitionName,
    renamedTo,
  } = await resolveDomesticPageContext(params);

  const availableRounds = await listSeasonRounds(
    categoryId,
    competitionId,
    seasonId,
    currentSeason
  );
  const roundParam = parseTasoRoundParam(params.kierros, availableRounds);
  const selectedRound = roundParam.kind === "valid" ? roundParam.round : undefined;

  const result = await getSeasonStandings(
    categoryId,
    competitionId,
    seasonId,
    currentSeason,
    selectedRound
  );

  const isCup = isDomesticCup(competitionCode);
  const teamHref = (teamProviderId: number) =>
    `/kotimaa/joukkue/${teamProviderId}?kilpailu=${competitionCode}&kausi=${seasonId}`;

  // Above the rounds, not below them as Champions League does: a cup page has
  // no standings table to lead with, so burying the bracket under as many as
  // ten round lists — one of them 248 teams wide — would hide the most useful
  // part of the page. Each drawn round still keeps its own list below.
  const bracket =
    result.status === "ok"
      ? buildCupBracket(
          result.groups.flatMap((group) =>
            group.kind === "match-list"
              ? [{ groupId: group.groupId, groupName: group.groupName, matches: group.matches }]
              : []
          )
        )
      : [];

  return (
    <PageShell heading={`${seasonCompetitionName} ${seasonLabel}`}>
      <RenamedNotice renamedTo={renamedTo} />
      <p className="mb-6">
        <Link
          className="text-sm hover:underline"
          href={`/kotimaa/ottelut?kilpailu=${competitionCode}&kausi=${seasonId}`}
        >
          Kaikki ottelut
        </Link>
      </p>
      {competitionParam.kind === "invalid" && (
        <Notice>Kilpailua ei löytynyt. Näytetään {competitionName}.</Notice>
      )}
      {season.kind === "invalid" && (
        <Notice>Kautta ei löytynyt. Näytetään kausi {seasonLabel}.</Notice>
      )}
      {roundParam.kind === "invalid" && <Notice>{INVALID_ROUND_MESSAGE}</Notice>}
      <TasoStandingsControls
        competitionCode={competitionCode}
        seasons={selectableSeasons}
        selectedSeasonId={seasonId}
        availableRounds={availableRounds}
        selectedRound={selectedRound}
      />
      {result.status === "empty" && <p>{EMPTY_MESSAGE}</p>}
      {result.status === "error" && <p>{ERROR_MESSAGE}</p>}
      {bracket.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 font-semibold text-xl">{KNOCKOUT_HEADING}</h2>
          <BracketTree rounds={bracket} teamHref={teamHref} />
        </section>
      )}
      {result.status === "ok" &&
        result.groups.map((group) =>
          isCup ? (
            <CupRoundSection group={group} key={group.groupId} teamHref={teamHref} />
          ) : (
            <section className="mb-10" key={group.groupId}>
              <h2 className="mb-3 font-semibold text-xl">{displayGroupName(group.groupName)}</h2>
              <GroupBody group={group} isCup={false} teamHref={teamHref} />
            </section>
          )
        )}
      <StandingsLegend />
    </PageShell>
  );
}
