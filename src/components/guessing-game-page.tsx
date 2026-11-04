import { GuessForm, JoinGameButton } from "@/components/guessing-game-controls";
import { PANEL_HEADING, TABLE_HEADING } from "@/components/heading-classes";
import { Notice } from "@/components/notice";
import { type Guess, STARTING_BALANCE, type Tier } from "@/lib/guessing-game";
import type { GameView, SettledGuess, UpcomingMatch } from "@/lib/guessing-game-store";
import { formatKickoff } from "@/lib/match-detail";

/**
 * What `/arvauspeli` shows a signed-in reader: the way in, or the player's
 * balance, the matches they can guess, and what their guesses paid.
 *
 * decisions/072-match-guesses.md
 */

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

const TIER_LABELS: Readonly<Record<Exclude<Tier, "miss">, string>> = {
  exact: "Oikea tulos",
  difference: "Oikea maaliero",
  outcome: "Oikea merkki",
};

function settledLine(guess: SettledGuess): string {
  return guess.tier === "miss" ? "Ei osunut" : `${TIER_LABELS[guess.tier]} +${guess.reward}`;
}

function priceLine(match: UpcomingMatch): string {
  if (match.floor) return "Maksuton 1X2-arvaus";
  const now = match.guess === null ? `Hinta nyt ${match.price}` : `Muutos maksaa ${match.price}`;
  return match.nextRise === null
    ? now
    : `${now}, nousee ${match.nextRise.price}:een ${formatKickoff(match.nextRise.at)}`;
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
      {match.free ? (
        <p className="text-muted text-sm">Maksutonta arvausta ei voi muuttaa.</p>
      ) : (
        <>
          <p className="text-muted text-sm">{priceLine(match)}</p>
          <GuessForm
            awayTeamName={match.awayTeamName}
            floor={match.floor}
            guess={match.guess}
            homeTeamName={match.homeTeamName}
            providerMatchId={match.providerMatchId}
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
    <section className="mt-8">
      <h2 className={TABLE_HEADING}>Tulevat ottelut</h2>
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
    </section>
  );
}

export function GuessingGamePage({ view }: Readonly<{ view: GameView }>) {
  if (view.kind === "no-season" || view.kind === "between") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>
          {view.kind === "between"
            ? `Kauden ${view.nextSeasonId} ottelut julkaistaan myöhemmin.`
            : "Veikkausliigan ottelut julkaistaan myöhemmin."}
        </p>
        {!view.joined && <JoinSection grant={STARTING_BALANCE} />}
      </div>
    );
  }
  if (view.kind === "not-joined") return <JoinSection grant={view.grant} />;

  const floor = view.upcoming.some((match) => match.floor);
  return (
    <div>
      <p className="font-semibold text-lg">Pelimerkit: {tokens.format(view.balance)}</p>
      {floor && (
        <div className="mt-4">
          <Notice>
            Pelimerkkisi eivät riitä arvaukseen. Voit tehdä yhden maksuttoman 1X2-arvauksen
            kerrallaan.
          </Notice>
        </div>
      )}
      <Upcoming groups={view.groups} matches={view.upcoming} />
      {view.awaiting.length > 0 && (
        <section className="mt-8">
          <h2 className={TABLE_HEADING}>Odottavat tulosta</h2>
          <ul>
            {view.awaiting.map((guess) => (
              <li className="border-border-subtle border-b py-3" key={guess.providerMatchId}>
                <span className="font-medium">
                  {guess.homeTeamName} – {guess.awayTeamName}
                </span>
                <p className="text-sm">Arvauksesi: {formatGuess(guess.guess)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {view.settled.length > 0 && (
        <section className="mt-8">
          <h2 className={TABLE_HEADING}>Ratkaistut</h2>
          <ul>
            {view.settled.map((guess) => (
              <li className="border-border-subtle border-b py-3" key={guess.providerMatchId}>
                <span className="font-medium">
                  {guess.homeTeamName} {guess.homeGoals}–{guess.awayGoals} {guess.awayTeamName}
                </span>
                <p className="text-sm">Arvauksesi: {formatGuess(guess.guess)}</p>
                <p className="text-sm">{settledLine(guess)}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
