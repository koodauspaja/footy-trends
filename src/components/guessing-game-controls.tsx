"use client";

/**
 * `Arvauspeli`'s two controls: joining, and one match's guess. Each calls its
 * server action and then refreshes the page, which reads the new balance on
 * the server.
 *
 * decisions/072-match-guesses.md
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Guess, Outcome } from "@/lib/guessing-game";
import { MAX_GUESSED_GOALS, sameGuess } from "@/lib/guessing-game";
import { type GuessRefusal, joinGameAction, placeGuessAction } from "@/lib/guessing-game-actions";
import { reportClientError } from "@/lib/report-client-error";

const BUTTON =
  "rounded border border-border px-3 py-2 text-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";

const REFUSALS: Readonly<Record<GuessRefusal, string>> = {
  started: "Ottelu on jo alkanut.",
  insufficient: "Pelimerkit eivät riitä.",
  "free-fixed": "Maksutonta arvausta ei voi muuttaa.",
  failed: "Arvausta ei voitu tallentaa. Yritä uudelleen.",
};

const OUTCOMES: readonly Outcome[] = ["1", "X", "2"];

export function JoinGameButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        className={BUTTON}
        disabled={pending}
        onClick={() => {
          setFailed(false);
          startTransition(async () => {
            try {
              const result = await joinGameAction();
              if (result.ok) router.refresh();
              else setFailed(true);
            } catch (error) {
              reportClientError(error, "guessing-game.join");
              setFailed(true);
            }
          });
        }}
        type="button"
      >
        Liity peliin
      </button>
      {failed && <p role="alert">Liittyminen epäonnistui. Yritä uudelleen.</p>}
    </div>
  );
}

type Choice = Outcome | "score";

function choiceOf(guess: Guess | null): Choice | null {
  if (guess === null) return null;
  return guess.kind === "outcome" ? guess.outcome : "score";
}

function goalsOf(value: string): number | null {
  const goals = Number(value);
  return /^\d+$/.test(value) && goals <= MAX_GUESSED_GOALS ? goals : null;
}

/**
 * The guess the form holds, or `null` while it is not yet a whole one: a
 * score needs both sides.
 *
 * decisions/072-match-guesses.md
 */
function formGuess(choice: Choice | null, home: string, away: string): Guess | null {
  if (choice === null) return null;
  if (choice !== "score") return { kind: "outcome", outcome: choice };
  const homeGoals = goalsOf(home);
  const awayGoals = goalsOf(away);
  return homeGoals === null || awayGoals === null ? null : { kind: "score", homeGoals, awayGoals };
}

export function GuessForm({
  providerMatchId,
  homeTeamName,
  awayTeamName,
  guess,
  floor,
}: Readonly<{
  providerMatchId: number;
  homeTeamName: string;
  awayTeamName: string;
  guess: Guess | null;
  /** Only the floor's free 1X2 is open, so a score cannot be guessed. */
  floor: boolean;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [choice, setChoice] = useState<Choice | null>(choiceOf(guess));
  const [home, setHome] = useState(guess?.kind === "score" ? String(guess.homeGoals) : "");
  const [away, setAway] = useState(guess?.kind === "score" ? String(guess.awayGoals) : "");
  const [refusal, setRefusal] = useState<GuessRefusal | null>(null);

  const next = formGuess(choice, home, away);
  const unchanged = next !== null && guess !== null && sameGuess(next, guess);
  const choices: readonly Choice[] = floor ? OUTCOMES : [...OUTCOMES, "score"];
  const name = `guess-${providerMatchId}`;

  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (next === null) return;
        setRefusal(null);
        startTransition(async () => {
          try {
            const result = await placeGuessAction(providerMatchId, next);
            if (result.ok) router.refresh();
            else setRefusal(result.reason);
          } catch (error) {
            reportClientError(error, "guessing-game.guess");
            setRefusal("failed");
          }
        });
      }}
    >
      <fieldset className="flex flex-wrap items-center gap-3">
        <legend className="sr-only">
          Arvaus: {homeTeamName} – {awayTeamName}
        </legend>
        {choices.map((option) => (
          <label className="flex items-center gap-1 text-sm" key={option}>
            <input
              checked={choice === option}
              name={name}
              onChange={() => setChoice(option)}
              type="radio"
              value={option}
            />
            {option === "score" ? "Arvaa tulos" : option}
          </label>
        ))}
        {choice === "score" && (
          <span className="flex items-center gap-1 text-sm">
            <input
              aria-label={`${homeTeamName}, maalit`}
              className="w-14 rounded border border-border px-2 py-1"
              inputMode="numeric"
              max={MAX_GUESSED_GOALS}
              min={0}
              onChange={(event) => setHome(event.target.value)}
              type="number"
              value={home}
            />
            <span aria-hidden="true">–</span>
            <input
              aria-label={`${awayTeamName}, maalit`}
              className="w-14 rounded border border-border px-2 py-1"
              inputMode="numeric"
              max={MAX_GUESSED_GOALS}
              min={0}
              onChange={(event) => setAway(event.target.value)}
              type="number"
              value={away}
            />
          </span>
        )}
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button className={BUTTON} disabled={pending || next === null || unchanged} type="submit">
          {guess === null ? "Arvaa" : "Muuta arvausta"}
        </button>
        {refusal !== null && (
          <p className="text-sm" role="alert">
            {REFUSALS[refusal]}
          </p>
        )}
      </div>
    </form>
  );
}
