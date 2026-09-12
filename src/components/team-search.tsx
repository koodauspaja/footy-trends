"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useSession } from "@/lib/auth-client";
import type { TeamSearchView } from "@/lib/team-search";
import { searchTeamsAction } from "@/lib/team-search-actions";

/**
 * Finding a team by name, from specs/027-team-search.md.
 *
 * **Client-side, like `favourite-toggle.tsx`, and for the same reason.** This
 * renders in the site header, which is on every page — including the four
 * `tests/unit/app/rendering-mode.test.ts` keeps prerendered (#182). Reading the
 * session on the server would cost those pages their prerendering.
 *
 * It imports `team-search-actions` by name; Next replaces a `"use server"`
 * module with a network stub in the client bundle, so better-auth and the
 * database stay out of it. The types come from `team-search.ts` as **types
 * only**, which are erased.
 *
 * **A unit test rendering this must mock `@/lib/auth-client`** — see the note in
 * `favourite-toggle.tsx` about the broadcast channel outliving its jsdom.
 */

const LABEL = "Hae joukkuetta";
const SUBMIT = "Hae";
const EMPTY = "Ei hakutuloksia.";
const TOO_SHORT = "Kirjoita vähintään kaksi merkkiä.";
const FAILED = "Haku epäonnistui. Yritä uudelleen.";
const RESULTS_LABEL = "Hakutulokset";

type State =
  | { kind: "idle" }
  | { kind: "results"; teams: TeamSearchView[] }
  | { kind: "message"; text: string };

/**
 * The competition and season under the name, or nothing.
 *
 * **Both or neither**, which is what specs/027 asks for and what the first
 * version got wrong. A bare `2026` does not disambiguate two teams sharing a
 * name — the one thing this line exists for — and a placeholder like
 * `Tuntematon · 2026` tells the reader less than no line at all.
 *
 * A TASO national-team category has no name in any registry the app carries, so
 * that is the case this actually covers.
 */
function secondaryLine(team: TeamSearchView): string | null {
  if (team.competitionName === null || team.seasonId === null) return null;
  return `${team.competitionName} · ${team.seasonId}`;
}

export function TeamSearch() {
  const { data: session } = useSession();
  const [term, setTerm] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  /**
   * Which submission is current, so a slow earlier one cannot overwrite a fast
   * later one.
   *
   * Two searches in flight resolve in whatever order the network gives them,
   * and the reader would be left looking at results for a term they had already
   * replaced — silently, and indistinguishable from a correct answer.
   *
   * A ref rather than state: the closure that checks it is created before the
   * re-render, and bumping it must not itself cause one.
   *
   * Refusing to submit while one is pending would also close the race, but by
   * discarding what the reader asked for. The latest intent wins instead.
   */
  const latestSubmission = useRef(0);
  /**
   * Rendered only after hydration. The header is server-rendered on every page
   * and prerendered on four of them, where there is no session — and
   * better-auth's client can answer from its own cache on the first client
   * render, which would disagree with that HTML.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const fieldId = useId();

  if (!mounted || !session) return null;

  return (
    <div className="w-full sm:w-auto">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setState({ kind: "idle" });
          latestSubmission.current += 1;
          const submission = latestSubmission.current;
          const superseded = () => submission !== latestSubmission.current;

          startTransition(async () => {
            try {
              const result = await searchTeamsAction(term);
              if (superseded()) return;
              if (result.ok) {
                setState(
                  result.teams.length === 0
                    ? { kind: "message", text: EMPTY }
                    : { kind: "results", teams: result.teams }
                );
                return;
              }
              // A signed-out reader is not offered this at all, so the only
              // way to see that reason is a session that expired mid-page —
              // where "try again" is the right advice anyway.
              setState({
                kind: "message",
                text: result.reason === "too-short" ? TOO_SHORT : FAILED,
              });
            } catch {
              if (superseded()) return;
              setState({ kind: "message", text: FAILED });
            }
          });
        }}
      >
        <label className="sr-only" htmlFor={fieldId}>
          {LABEL}
        </label>
        <input
          aria-busy={pending}
          className="min-w-0 flex-1 rounded border border-border-subtle bg-transparent px-2 py-1 text-sm sm:w-48 sm:flex-none"
          id={fieldId}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={LABEL}
          type="search"
          value={term}
        />
        <button className="shrink-0 text-sm hover:underline" disabled={pending} type="submit">
          {SUBMIT}
        </button>
      </form>

      {state.kind === "message" && <p className="mt-1 text-muted text-xs">{state.text}</p>}

      {state.kind === "results" && (
        <ul aria-label={RESULTS_LABEL} className="mt-1 flex flex-col gap-1">
          {state.teams.map((team) => {
            const href = team.href;
            const secondary = secondaryLine(team);
            return (
              <li className="text-sm" key={`${team.source}:${team.teamProviderId}`}>
                {href === null ? (
                  <span>{team.name}</span>
                ) : (
                  <Link className="hover:underline" href={href}>
                    {team.name}
                  </Link>
                )}
                {secondary !== null && <span className="ml-2 text-muted text-xs">{secondary}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
