/**
 * What `/arvauspeli` shows a signed-in reader: the way in, or the player's
 * balance, the matches they can guess, and what their guesses paid.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 * decisions/077-nickname.md
 * decisions/073-leaderboard.md
 * decisions/074-against-the-models.md
 * decisions/075-season-guesses.md
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { GuessForm, JoinGameButton } from "@/components/guessing-game-controls";
import { SeasonGuessForm } from "@/components/guessing-game-season-form";
import { PANEL_HEADING, TABLE_HEADING } from "@/components/heading-classes";
import { Notice } from "@/components/notice";
import { modelLabel } from "@/components/prediction-quality-page";
import { SectionFold } from "@/components/section-fold";
import {
  type Board,
  type BoardRow,
  type Guess,
  type Settlement,
  type Shares,
  STARTING_BALANCE,
} from "@/lib/guessing-game";
import type { ModelGuess } from "@/lib/guessing-game-models";
import {
  SEASON_KINDS,
  SEASON_PRICES,
  SEASON_REWARDS,
  type SeasonKind,
} from "@/lib/guessing-game-season";
import type { PickShares, SeasonSection, ShownSeasonGuess } from "@/lib/guessing-game-season-store";
import type {
  AwaitingGuess,
  GameView,
  SettledGuess,
  UpcomingMatch,
} from "@/lib/guessing-game-store";
import { matchCountLabel } from "@/lib/match-count";
import { formatKickoff } from "@/lib/match-detail";

const INTRO =
  "Arvaa Veikkausliigan otteluiden tuloksia pelimerkeillä. Pelimerkkejä ei voi ostaa, myydä eikä vaihtaa mihinkään.";

const dayFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("fi-FI", {
  timeZone: "Europe/Helsinki",
  hour: "2-digit",
  minute: "2-digit",
});

const tokens = new Intl.NumberFormat("fi-FI");

function formatGuess(guess: Guess): string {
  return guess.kind === "outcome" ? guess.outcome : `${guess.homeGoals}–${guess.awayGoals}`;
}

/**
 * What each way of settling says before what it paid back. A miss says only
 * that it missed.
 *
 * decisions/072-match-guesses.md
 * decisions/076-guesses-on-irregular-matches.md
 */
const SETTLEMENT_LABELS: Readonly<Record<Exclude<Settlement, "miss">, string>> = {
  exact: "Oikea tulos",
  difference: "Oikea maaliero",
  outcome: "Oikea merkki",
  awarded: "Ottelu ratkaistiin päätöksellä",
  abandoned: "Ottelu keskeytettiin, pelimerkit palautettu",
  undecided: "Ottelua ei ratkaistu, pelimerkit palautettu",
  void: "Arvaus tehtiin ottelun alettua, pelimerkit palautettu",
};

function settledLine(guess: SettledGuess): string {
  return guess.settlement === "miss"
    ? "Ei osunut"
    : `${SETTLEMENT_LABELS[guess.settlement]} +${guess.reward}`;
}

function settledMatch(guess: SettledGuess): string {
  return guess.homeGoals === null || guess.awayGoals === null
    ? `${guess.homeTeamName} – ${guess.awayTeamName}`
    : `${guess.homeTeamName} ${guess.homeGoals}–${guess.awayGoals} ${guess.awayTeamName}`;
}

function priceLine(match: UpcomingMatch): string {
  if (match.postponed) return "Muutos on maksuton";
  if (match.floor) return "Maksuton 1X2-arvaus";
  const now = match.guess === null ? `Hinta nyt ${match.price}` : `Muutos maksaa ${match.price}`;
  return match.nextRise === null
    ? now
    : `${now}, nousee ${match.nextRise.price}:een ${formatKickoff(match.nextRise.at)}`;
}

function guessCount(count: number): string {
  return count === 1 ? "1 arvaus" : `${count} arvausta`;
}

/**
 * One of the page's sections, folded by its heading with its count after it.
 * Only `Tulevat ottelut`, the page's most basic part, starts open; nothing is
 * remembered.
 *
 * decisions/072-match-guesses.md
 */
function GameFold({
  id,
  heading,
  count,
  open,
  children,
}: Readonly<{ id: string; heading: string; count: string; open: boolean; children: ReactNode }>) {
  return (
    <SectionFold
      className="mt-8"
      fold={{ initiallyOpen: open, remember: null }}
      headingId={id}
      summary={
        <>
          <h2 className={TABLE_HEADING} id={id}>
            {heading}
          </h2>
          <span className="text-muted text-sm">({count})</span>
        </>
      }
      summaryClassName="mb-2"
    >
      {children}
    </SectionFold>
  );
}

function JoinSection({ grant }: Readonly<{ grant: number }>) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p>{INTRO}</p>
      {grant < STARTING_BALANCE && (
        <p>Kausi on jo alkanut: saat {grant} pelimerkkiä, osuutena jäljellä olevista otteluista.</p>
      )}
      <JoinGameButton />
    </div>
  );
}

function UpcomingRow({ match, groups }: Readonly<{ match: UpcomingMatch; groups: number }>) {
  return (
    <li className="border-border-subtle border-b py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">
          {match.homeTeamName} – {match.awayTeamName}
        </span>
        <span className="text-muted text-sm">
          klo {timeFormatter.format(match.kickoffAt)}
          {groups > 1 && ` · ${match.groupName}`}
        </span>
      </div>
      {match.guess !== null && <p className="text-sm">Arvauksesi: {formatGuess(match.guess)}</p>}
      {match.free && !match.postponed ? (
        <p className="text-muted text-sm">Maksutonta arvausta ei voi muuttaa.</p>
      ) : (
        <>
          {match.postponed && (
            <p className="text-sm">Ottelu siirtyi. Voit muuttaa arvaustasi kerran maksutta.</p>
          )}
          <p className="text-muted text-sm">{priceLine(match)}</p>
          <GuessForm
            awayTeamName={match.awayTeamName}
            floor={match.floor || match.free}
            guess={match.guess}
            homeTeamName={match.homeTeamName}
            providerMatchId={match.providerMatchId}
            shownPrice={match.floor || match.postponed ? 0 : match.price}
          />
        </>
      )}
    </li>
  );
}

function Upcoming({
  matches,
  groups,
}: Readonly<{ matches: readonly UpcomingMatch[]; groups: number }>) {
  const days = Map.groupBy(matches, (match) => dayFormatter.format(match.kickoffAt));
  return (
    <GameFold count={matchCountLabel(matches.length)} heading="Tulevat ottelut" id="upcoming" open>
      {matches.length === 0 && <p className="mt-2">Ei tulevia otteluita.</p>}
      {[...days].map(([day, rows]) => (
        <div className="mt-4" key={day}>
          <h3 className={PANEL_HEADING}>{day}</h3>
          <ul>
            {rows.map((match) => (
              <UpcomingRow groups={groups} key={match.providerMatchId} match={match} />
            ))}
          </ul>
        </div>
      ))}
    </GameFold>
  );
}

/**
 * The players' guesses on a match once it has kicked off, or nothing when it
 * has too few to show.
 *
 * decisions/073-leaderboard.md
 */
function SharesLine({ shares }: Readonly<{ shares: Shares | undefined }>) {
  if (shares === undefined) return null;
  return (
    <p className="text-muted text-sm">
      Pelaajien arvaukset: 1 {shares["1"]} % · X {shares.X} % · 2 {shares["2"]} % (
      {guessCount(shares.total)})
    </p>
  );
}

function modelGuessText(guess: ModelGuess): string {
  return guess.score === null ? guess.outcome : `${guess.score.homeGoals}–${guess.score.awayGoals}`;
}

/**
 * The models' guesses on a match once it has kicked off, by the names the
 * prediction pages give them, or nothing when no model guessed it.
 *
 * decisions/074-against-the-models.md
 */
function ModelsLine({ models }: Readonly<{ models: readonly ModelGuess[] | undefined }>) {
  if (models === undefined || models.length === 0) return null;
  const guesses = models.map((guess) => `${modelLabel(guess.model)} ${modelGuessText(guess)}`);
  return <p className="text-muted text-sm">Mallit: {guesses.join(" · ")}</p>;
}

function playerCount(count: number): string {
  return count === 1 ? "1 pelaaja" : `${count} pelaajaa`;
}

function BoardTableRow({ row }: Readonly<{ row: BoardRow }>) {
  return (
    <tr className={`border-border-subtle border-b ${row.self ? "font-semibold" : ""}`}>
      <td className="py-2 pr-4 tabular-nums">{row.rank}.</td>
      <td className="py-2 pr-4">
        {row.nickname ?? "Nimetön pelaaja"}
        {row.self && <span className="text-muted"> (sinä)</span>}
      </td>
      <td className="py-2 pr-4 text-right tabular-nums">{tokens.format(row.balance)}</td>
      <td className="py-2 text-right tabular-nums">{row.settled}</td>
    </tr>
  );
}

/**
 * A season's leaderboard: the first 50 by balance, and the reader's own row
 * after them when it is further down. A failed read says so.
 *
 * decisions/073-leaderboard.md
 */
function Leaderboard({ board }: Readonly<{ board: Board | "error" }>) {
  if (board === "error") {
    return (
      <section className="mt-8">
        <h2 className={TABLE_HEADING}>Tulostaulukko</h2>
        <p className="mt-2">Tulostaulukon lataaminen epäonnistui. Yritä myöhemmin uudelleen.</p>
      </section>
    );
  }
  return (
    <GameFold count={playerCount(board.players)} heading="Tulostaulukko" id="leaderboard" open>
      {board.players === 0 ? (
        <p className="mt-2">Kukaan ei ole vielä arvannut tällä kaudella.</p>
      ) : (
        <div className="scroll-edge overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border border-b">
                <th className="py-2 pr-4">Sija</th>
                <th className="py-2 pr-4">Pelaaja</th>
                <th className="py-2 pr-4 text-right">Pelimerkit</th>
                <th className="py-2 text-right">Ratkaistut</th>
              </tr>
            </thead>
            <tbody>
              {board.rows.map((row) => (
                <BoardTableRow key={row.place} row={row} />
              ))}
              {board.own !== null && (
                <>
                  <tr>
                    <td className="py-1 text-muted" colSpan={4}>
                      …
                    </td>
                  </tr>
                  <BoardTableRow row={board.own} />
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </GameFold>
  );
}

function Awaiting({
  guesses,
  shares,
  models,
}: Readonly<{
  guesses: readonly AwaitingGuess[];
  shares: ReadonlyMap<number, Shares>;
  models: ReadonlyMap<number, ModelGuess[]>;
}>) {
  if (guesses.length === 0) return null;
  return (
    <GameFold
      count={guessCount(guesses.length)}
      heading="Odottavat tulosta"
      id="awaiting"
      open={false}
    >
      <ul>
        {guesses.map((guess) => (
          <li className="border-border-subtle border-b py-3" key={guess.providerMatchId}>
            <span className="font-medium">
              {guess.homeTeamName} – {guess.awayTeamName}
            </span>
            <p className="text-sm">Arvauksesi: {formatGuess(guess.guess)}</p>
            <SharesLine shares={shares.get(guess.providerMatchId)} />
            <ModelsLine models={models.get(guess.providerMatchId)} />
          </li>
        ))}
      </ul>
    </GameFold>
  );
}

const SEASON_LABELS: Readonly<Record<SeasonKind, string>> = {
  champion: "Mestari",
  upper: "Mestaruussarjan joukkueet",
  last: "Putoaja",
  table: "Lopullinen sarjataulukko",
};

const SEASON_TERMS: Readonly<Record<SeasonKind, string>> = {
  champion: `Hinta ${SEASON_PRICES.champion} · oikein ${SEASON_REWARDS.champion}`,
  upper: `Hinta ${SEASON_PRICES.upper} · ${SEASON_REWARDS.upperTeam} jokaisesta oikeasta`,
  last: `Hinta ${SEASON_PRICES.last} · oikein ${SEASON_REWARDS.last}`,
  table: `Hinta ${SEASON_PRICES.table} · ${SEASON_REWARDS.tableExact} oikeasta sijasta, ${SEASON_REWARDS.tableNear} yhden sijan päästä`,
};

/**
 * What a settled season guess says: paid, missed or refunded.
 *
 * decisions/075-season-guesses.md
 */
function seasonSettledLine(kind: SeasonKind, settled: NonNullable<ShownSeasonGuess["settled"]>) {
  if (settled.kind === "void") return "Kausi jäi kesken, pelimerkit palautettu";
  if (kind === "upper") return `${settled.right} oikein, +${settled.reward}`;
  if (kind === "table") {
    return `${settled.right} täsmälleen oikein, ${settled.near} yhden sijan päästä, +${settled.reward}`;
  }
  return settled.right > 0 ? `Oikein, +${settled.reward}` : "Ohi";
}

function seasonGuessText(kind: SeasonKind, teams: readonly number[], name: (id: number) => string) {
  if (kind === "table") return teams.map((team, index) => `${index + 1}. ${name(team)}`).join(", ");
  return teams.map(name).join(", ");
}

function PickSharesLine({
  shares,
  name,
}: Readonly<{ shares: PickShares | null; name: (id: number) => string }>) {
  if (shares === null) return null;
  const parts = shares.shares.map(
    (share) =>
      `${share.teamProviderId === null ? "muut" : name(share.teamProviderId)} ${share.percent} %`
  );
  return (
    <p className="text-muted text-sm">
      Pelaajien arvaukset: {parts.join(" · ")} ({guessCount(shares.total)})
    </p>
  );
}

/**
 * `Kauden arvaukset`: before the lock a form per kind, after it the player's
 * guesses, the shares of the champion and last-place picks, guessed or not,
 * and once settled what each paid.
 *
 * decisions/075-season-guesses.md
 */
function SeasonGuesses({ section }: Readonly<{ section: SeasonSection }>) {
  const names = new Map(section.teams.map((team) => [team.teamProviderId, team.name]));
  const name = (id: number) => names.get(id) ?? "–";
  const placed = SEASON_KINDS.filter((kind) => section.guesses[kind] !== undefined);
  const sharesOf = (kind: SeasonKind) =>
    kind === "champion" || kind === "last" ? (section.shares?.[kind] ?? null) : null;
  // After the lock: the kinds the player guessed, and the champion and
  // last-place shares whether or not the player guessed those kinds.
  const kinds = section.locked
    ? SEASON_KINDS.filter((kind) => placed.includes(kind) || sharesOf(kind) !== null)
    : SEASON_KINDS;
  return (
    <GameFold count={guessCount(placed.length)} heading="Kauden arvaukset" id="season" open>
      {!section.locked && (
        <p className="text-sm">
          Arvaa kausi ennen sen ensimmäistä ottelua {dayFormatter.format(section.lockAt)} klo{" "}
          {timeFormatter.format(section.lockAt)}. Arvauksia voi muuttaa maksutta siihen asti.
        </p>
      )}
      <ul>
        {kinds.map((kind) => {
          const guess = section.guesses[kind];
          const shares = sharesOf(kind);
          return (
            <li className="border-border-subtle border-b py-3" key={kind}>
              <h3 className="font-medium">{SEASON_LABELS[kind]}</h3>
              {!section.locked && <p className="text-muted text-sm">{SEASON_TERMS[kind]}</p>}
              {guess !== undefined && (
                <p className="text-sm">Arvauksesi: {seasonGuessText(kind, guess.teams, name)}</p>
              )}
              {guess?.settled != null && (
                <p className="text-sm">{seasonSettledLine(kind, guess.settled)}</p>
              )}
              <PickSharesLine name={name} shares={shares} />
              {!section.locked && (
                <SeasonGuessForm
                  guess={guess?.teams ?? null}
                  kind={kind}
                  label={SEASON_LABELS[kind]}
                  teams={section.teams}
                />
              )}
            </li>
          );
        })}
      </ul>
    </GameFold>
  );
}

/**
 * The line for a joined player without a nickname, saying where to choose one.
 *
 * decisions/077-nickname.md
 */
function NicknameHint() {
  return (
    <p className="mt-2 text-sm">
      Valitse <Link href="/asetukset">nimimerkki</Link>, jolla näyt tulostaulukossa.
    </p>
  );
}

type Props = Readonly<{
  view: GameView;
  hasNickname: boolean;
  /** The season's leaderboard, `"error"` when it could not be read, `null` with no season. */
  board: Board | "error" | null;
  /** The players' guesses on the reader's matches that have kicked off. */
  shares: ReadonlyMap<number, Shares>;
  /** The models' guesses on the reader's matches that have kicked off. */
  models: ReadonlyMap<number, ModelGuess[]>;
  /** The player's season guesses, or `null` with none to show. */
  season: SeasonSection | null;
}>;

export function GuessingGamePage({ view, hasNickname, board, shares, models, season }: Props) {
  const leaderboard = board === null ? null : <Leaderboard board={board} />;
  const seasonGuesses = season === null ? null : <SeasonGuesses section={season} />;
  if (view.kind === "no-season" || view.kind === "between") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>
          {view.kind === "between"
            ? `Kauden ${view.nextSeasonId} ottelut julkaistaan myöhemmin.`
            : "Veikkausliigan ottelut julkaistaan myöhemmin."}
        </p>
        {!view.joined && <JoinSection grant={STARTING_BALANCE} />}
        {view.joined && !hasNickname && <NicknameHint />}
        {seasonGuesses}
        {view.kind === "between" && (
          <Awaiting guesses={view.awaiting} models={models} shares={shares} />
        )}
        {leaderboard}
      </div>
    );
  }
  if (view.kind === "not-joined") {
    return (
      <div>
        <JoinSection grant={view.grant} />
        {leaderboard}
      </div>
    );
  }

  const floor = view.upcoming.some((match) => match.floor);
  return (
    <div>
      <p className="font-semibold text-lg">Pelimerkit: {tokens.format(view.balance)}</p>
      {!hasNickname && <NicknameHint />}
      {floor && (
        <div className="mt-4">
          <Notice>
            Pelimerkkisi eivät riitä arvaukseen. Voit tehdä yhden maksuttoman 1X2-arvauksen
            kerrallaan.
          </Notice>
        </div>
      )}
      {seasonGuesses}
      <Upcoming groups={view.groups} matches={view.upcoming} />
      {leaderboard}
      <Awaiting guesses={view.awaiting} models={models} shares={shares} />
      {view.settled.length > 0 && (
        <GameFold
          count={guessCount(view.settled.length)}
          heading="Ratkaistut"
          id="settled"
          open={false}
        >
          <ul>
            {view.settled.map((guess) => (
              <li className="border-border-subtle border-b py-3" key={guess.providerMatchId}>
                <span className="font-medium">{settledMatch(guess)}</span>
                <p className="text-sm">Arvauksesi: {formatGuess(guess.guess)}</p>
                <p className="text-sm">{settledLine(guess)}</p>
                {guess.bonus > 0 && <p className="text-sm">Harvinainen osuma +{guess.bonus}</p>}
                {guess.modelsReward > 0 && (
                  <p className="text-sm">Voitit mallit +{guess.modelsReward}</p>
                )}
                <SharesLine shares={shares.get(guess.providerMatchId)} />
                <ModelsLine models={models.get(guess.providerMatchId)} />
              </li>
            ))}
          </ul>
        </GameFold>
      )}
    </div>
  );
}
