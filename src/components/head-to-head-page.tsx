import type { Metadata } from "next";
import { type MatchListRow, MatchListTable } from "@/components/match-list-table";
import { PageShell } from "@/components/page-shell";
import { toFinnishTasoTeamNames, toFinnishTeamNames } from "@/lib/country-names";
import { getSeasonContext } from "@/lib/football-data";
import {
  type HeadToHeadRecord,
  headToHeadRecord,
  headToHeadWindow,
  headToHeadWindowSentence,
} from "@/lib/head-to-head";
import { logger } from "@/lib/logger";
import { teamDisplayName } from "@/lib/match-detail";
import {
  type FootballDataMatchRow,
  getHeadToHeadHistory,
  type HeadToHeadResult,
  type TasoMatchRow,
} from "@/lib/match-service";
import type { MatchSource } from "@/lib/match-source";
import {
  COMPETITION_COLUMN,
  categoryNameLoader,
  type Labelled,
  labelFootballDataRows,
  labelTasoRows,
} from "@/lib/meeting-labels";
import { matchCountLabel, type NationalTeam } from "@/lib/national-team";
import { isStoredInteger } from "@/lib/provider-ids";
import { toFinishedMatches } from "@/lib/standings";

const HEADING = "Kohtaamiset";
const SUMMARY_HEADING = "Yhteenveto";
const MEETINGS_HEADING = "Kohtaamiset";
const NOT_FOUND_MESSAGE = "Kohtaamisia ei löytynyt.";
const ERROR_MESSAGE = "Kohtaamisten lataaminen epäonnistui. Yritä myöhemmin uudelleen.";
const DRAWS_LABEL = "tasan";
const GOALS_LABEL = "Maalit";
const HOME_SUFFIX = "kotona";

/** What a route file supplies to make this page its own. */
export type HeadToHeadPageOptions = {
  params: Promise<{ a: string; b: string }>;
  /** Which table the ids resolve against, and under what predicate. See specs/019. */
  source: MatchSource;
  /** This route's own prefix, so a row links back to its match page. */
  basePath: string;
  /** Set on the national-team routes, which name their competitions through it. */
  nationalTeam?: NationalTeam;
};

/**
 * `24 ottelua, 1998–2025`, or a single year where that is the whole history.
 *
 * `matchCountLabel` rather than a literal `ottelua`: Finnish counts one thing
 * differently, and a pair that has met once would otherwise read `1 ottelua`.
 */
export function playedLine(record: HeadToHeadRecord): string {
  const span = record.from === record.to ? `${record.from}` : `${record.from}–${record.to}`;
  return `${matchCountLabel(record.played)}, ${span}`;
}

/** `HJK 11 – 6 tasan – 7 KuPS`, the first team's record read left to right. */
export function recordLine(record: HeadToHeadRecord, first: string, second: string): string {
  return `${first} ${record.wins} – ${record.draws} ${DRAWS_LABEL} – ${record.losses} ${second}`;
}

/** `Maalit 38 – 31`, the first team's first. */
export function goalsLine(record: HeadToHeadRecord): string {
  return `${GOALS_LABEL} ${record.goalsFor} – ${record.goalsAgainst}`;
}

/** `HJK kotona 8 – 3 – 1`, a win–draw–loss from that ground's home side. */
export function homeLine(
  team: string,
  side: { wins: number; draws: number; losses: number }
): string {
  return `${team} ${HOME_SUFFIX} ${side.wins} – ${side.draws} – ${side.losses}`;
}

type View = {
  first: string;
  second: string;
  /**
   * Never null. A view exists only when the pair has a meeting, and a meeting
   * is what `headToHeadRecord` needs — so the summary cannot be handed a record
   * of nothing, and does not guard against one.
   */
  record: HeadToHeadRecord;
  rows: Array<Labelled<MatchListRow>>;
  windowSentence: string;
};

/**
 * Whether this region's seasons cross a calendar year, for the window sentence.
 *
 * `false` when the provider cannot be reached, which is what the match page
 * does for the same sentence: a season label that reads `2026` rather than
 * `2026/27` is a smaller wrong than no page.
 */
async function resolveSpans(source: MatchSource): Promise<boolean> {
  if (source.kind !== "football-data") return false;
  try {
    const [first] = source.region === "national-teams" ? ["WC"] : ["PL"];
    return (await getSeasonContext(first as string)).spansCalendarYears;
  } catch (error) {
    logger.error({ err: error }, "Unable to resolve the head-to-head window label");
    return false;
  }
}

/**
 * The name each team goes by, read off the meetings themselves.
 *
 * There is no match to take them from — the page is addressed by two ids — so
 * the first meeting names both, and whichever side an id was on in it decides
 * which name belongs to which id.
 */
function namesFrom(
  rows: ReadonlyArray<{
    homeTeamProviderId: number;
    homeTeamName: string;
    awayTeamProviderId: number;
    awayTeamName: string;
  }>,
  first: number
): { first: string; second: string } | null {
  const [meeting] = rows;
  if (meeting === undefined) return null;

  const firstIsHome = meeting.homeTeamProviderId === first;
  return {
    first: teamDisplayName(first, firstIsHome ? meeting.homeTeamName : meeting.awayTeamName),
    second: teamDisplayName(
      firstIsHome ? meeting.awayTeamProviderId : meeting.homeTeamProviderId,
      firstIsHome ? meeting.awayTeamName : meeting.homeTeamName
    ),
  };
}

async function buildView(
  history: Extract<HeadToHeadResult, { status: "ok" }>,
  first: number,
  options: HeadToHeadPageOptions
): Promise<View | null> {
  const windowSentence = headToHeadWindowSentence(
    headToHeadWindow(options.source, await resolveSpans(options.source))
  );

  if (options.source.kind === "football-data") {
    const rows = history.matches as FootballDataMatchRow[];
    const localised = options.source.region === "national-teams" ? toFinnishTeamNames(rows) : rows;
    const names = namesFrom(localised, first);
    // `toFinishedMatches` narrows the two goal columns, which the query has
    // already filtered on — the record cannot be asked about a match with no
    // score, and this is where the type learns it.
    const record = headToHeadRecord(toFinishedMatches(localised), first);
    if (names === null || record === null) return null;

    return { ...names, record, rows: labelFootballDataRows(localised), windowSentence };
  }

  const rows = history.matches as TasoMatchRow[];
  const national = options.nationalTeam;
  const localised = national === undefined ? rows : toFinnishTasoTeamNames(rows);
  const names = namesFrom(localised, first);
  const record = headToHeadRecord(toFinishedMatches(localised), first);
  if (names === null || record === null) return null;

  return {
    ...names,
    record,
    rows: await labelTasoRows(national, localised, categoryNameLoader()),
    windowSentence,
  };
}

/** The `Yhteenveto` section: the record, the goals and each ground (specs/042, S9). */
function Summary({ view }: Readonly<{ view: View }>) {
  return (
    <section aria-labelledby="h2h-summary" className="mb-8">
      <h2 className="mb-2 font-semibold text-xl" id="h2h-summary">
        {SUMMARY_HEADING}
      </h2>
      <p className="text-muted text-sm">{playedLine(view.record)}</p>
      <p className="mt-1 font-medium text-lg">{recordLine(view.record, view.first, view.second)}</p>
      <p className="mt-1">{goalsLine(view.record)}</p>
      <p className="mt-3 text-sm">{homeLine(view.first, view.record.firstAtHome)}</p>
      <p className="text-sm">{homeLine(view.second, view.record.secondAtHome)}</p>
    </section>
  );
}

/**
 * Every stored meeting between two teams (specs/042).
 *
 * Reached from a match page and nowhere else (S1), so the pair always has a
 * history: a page with none is a hand-typed URL, and says so rather than
 * rendering an empty summary.
 */
export async function HeadToHeadPage(options: Readonly<HeadToHeadPageOptions>) {
  const resolved = await resolve(options);

  if (resolved.status === "error") {
    return (
      <PageShell heading={HEADING}>
        <p>{ERROR_MESSAGE}</p>
      </PageShell>
    );
  }
  if (resolved.status !== "ok") {
    return (
      <PageShell heading={HEADING}>
        <p>{NOT_FOUND_MESSAGE}</p>
      </PageShell>
    );
  }

  const { view } = resolved;
  return (
    <PageShell heading={`${HEADING}: ${view.first} – ${view.second}`}>
      <Summary view={view} />
      <section aria-labelledby="h2h-meetings">
        <h2 className="mb-2 font-semibold text-xl" id="h2h-meetings">
          {MEETINGS_HEADING}
        </h2>
        <p className="mb-4 text-muted text-sm">{view.windowSentence}</p>
        <MatchListTable
          fourthColumn={{ header: COMPETITION_COLUMN, render: (match) => match.label }}
          matchHref={(match) => `${options.basePath}/ottelu/${match.providerMatchId}`}
          matches={view.rows}
          teamHref={null}
        />
      </section>
    </PageShell>
  );
}

/**
 * The ids are the *provider's* team ids, as every team link on the site uses.
 * A non-numeric id, or a team against itself, never reaches a query.
 */
async function resolve(options: HeadToHeadPageOptions) {
  const { a, b } = await options.params;
  const first = Number(a);
  const second = Number(b);
  if (!isStoredInteger(first) || !isStoredInteger(second) || first === second) {
    return { status: "not_found" } as const;
  }

  const history = await getHeadToHeadHistory(options.source, first, second);
  if (history.status !== "ok") {
    return history.status === "error"
      ? ({ status: "error" } as const)
      : ({ status: "not_found" } as const);
  }

  const view = await buildView(history, first, options);
  return view === null ? ({ status: "not_found" } as const) : { status: "ok" as const, view };
}

export async function headToHeadMetadata(
  options: Readonly<HeadToHeadPageOptions>
): Promise<Metadata> {
  const resolved = await resolve(options);
  return {
    title:
      resolved.status === "ok"
        ? `${HEADING}: ${resolved.view.first} – ${resolved.view.second}`
        : HEADING,
  };
}
