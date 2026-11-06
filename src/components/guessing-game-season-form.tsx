"use client";

/**
 * One kind's season guess form: a team, six teams, or the whole table. It
 * calls its server action and then refreshes the page, which reads the new
 * balance on the server.
 *
 * decisions/075-season-guesses.md
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { placeSeasonGuessAction, type SeasonGuessRefusalShown } from "@/lib/guessing-game-actions";
import { SEASON_TEAM_COUNTS, type SeasonKind } from "@/lib/guessing-game-season";
import { reportClientError } from "@/lib/report-client-error";

const BUTTON =
  "rounded border border-border px-3 py-2 text-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";
const SELECT = "rounded border border-border bg-background px-2 py-1 text-sm";

const REFUSALS: Readonly<Record<SeasonGuessRefusalShown, string>> = {
  locked: "Kauden arvaukset ovat lukittuneet.",
  insufficient: "Pelimerkit eivät riitä.",
  failed: "Arvausta ei voitu tallentaa. Yritä uudelleen.",
};

/** Each kind's button, unlike every other's, before and after a guess is placed. */
const PLACE: Readonly<Record<SeasonKind, string>> = {
  champion: "Arvaa mestari",
  upper: "Arvaa joukkueet",
  last: "Arvaa putoaja",
  table: "Arvaa sarjataulukko",
};
const CHANGE: Readonly<Record<SeasonKind, string>> = {
  champion: "Muuta mestaria",
  upper: "Muuta joukkueita",
  last: "Muuta putoajaa",
  table: "Muuta sarjataulukkoa",
};

type Team = { teamProviderId: number; name: string };

/**
 * The teams the form holds, or `null` while they are not yet a whole guess:
 * every place chosen, each team once, and the six exactly six.
 *
 * decisions/075-season-guesses.md
 */
export function formTeams(kind: SeasonKind, chosen: readonly (number | null)[]): number[] | null {
  const teams = chosen.filter((team) => team !== null);
  if (teams.length !== SEASON_TEAM_COUNTS[kind] || new Set(teams).size !== teams.length) {
    return null;
  }
  return teams;
}

function TeamSelect({
  label,
  teams,
  value,
  onChange,
}: Readonly<{
  label: string;
  teams: readonly Team[];
  value: number | null;
  onChange: (team: number | null) => void;
}>) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-16">{label}</span>
      <select
        className={SELECT}
        onChange={(event) =>
          onChange(event.target.value === "" ? null : Number(event.target.value))
        }
        value={value ?? ""}
      >
        <option value="">Valitse joukkue</option>
        {teams.map((team) => (
          <option key={team.teamProviderId} value={team.teamProviderId}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function initialChoice(kind: SeasonKind, guess: readonly number[] | null): (number | null)[] {
  if (kind === "upper") return guess === null ? [] : [...guess];
  return Array.from({ length: SEASON_TEAM_COUNTS[kind] }, (_, index) => guess?.[index] ?? null);
}

export function SeasonGuessForm({
  kind,
  label,
  teams,
  guess,
}: Readonly<{
  kind: SeasonKind;
  /** The kind's name, for the controls' accessible names. */
  label: string;
  teams: readonly Team[];
  /** The player's guess of this kind, its teams in order, or `null`. */
  guess: readonly number[] | null;
}>) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<(number | null)[]>(() => initialChoice(kind, guess));
  const [refusal, setRefusal] = useState<SeasonGuessRefusalShown | null>(null);

  const next = formTeams(kind, chosen);
  const placed = chosen.filter((team) => team !== null);
  const repeated = kind === "table" && new Set(placed).size !== placed.length;
  const choose = (index: number, team: number | null) =>
    setChosen((current) => current.map((old, at) => (at === index ? team : old)));

  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (next === null) return;
        setRefusal(null);
        startTransition(async () => {
          try {
            const result = await placeSeasonGuessAction({ kind, teams: next });
            if (!result.ok) setRefusal(result.reason);
            if (result.ok || result.reason === "locked") router.refresh();
          } catch (error) {
            reportClientError(error, "guessing-game.season-guess");
            setRefusal("failed");
          }
        });
      }}
    >
      {kind === "upper" ? (
        <fieldset className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          <legend className="mb-1 text-sm">Valitse kuusi joukkuetta.</legend>
          {teams.map((team) => (
            <label className="flex items-center gap-2 text-sm" key={team.teamProviderId}>
              <input
                checked={chosen.includes(team.teamProviderId)}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked
                      ? [...current, team.teamProviderId]
                      : current.filter((id) => id !== team.teamProviderId)
                  )
                }
                type="checkbox"
              />
              {team.name}
            </label>
          ))}
        </fieldset>
      ) : (
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">{label}</legend>
          {chosen.map((team, index) => {
            const place = index + 1;
            return (
              <TeamSelect
                key={`${kind}-${place}`}
                label={kind === "table" ? `Sija ${place}` : label}
                onChange={(value) => choose(index, value)}
                teams={teams}
                value={team}
              />
            );
          })}
        </fieldset>
      )}
      {repeated && <p className="text-sm">Jokainen joukkue vain kerran.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button className={BUTTON} disabled={pending || next === null} type="submit">
          {guess === null ? PLACE[kind] : CHANGE[kind]}
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
