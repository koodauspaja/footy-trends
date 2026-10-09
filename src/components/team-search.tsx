"use client";

import Link from "next/link";
import { useId, useRef, useState, useTransition } from "react";
import { useSession } from "@/lib/auth-client";
import { reportClientError } from "@/lib/report-client-error";
import type { TeamSearchView } from "@/lib/team-search";
import { searchTeamsAction } from "@/lib/team-search-actions";

/**
 * Finding a team by name. A client component, rendered in the site header on
 * every page. A unit test rendering anything that contains it mocks
 * `@/lib/auth-client`, or runs the real client's cleanup as
 * `session-hydration.test.tsx` does.
 *
 * decisions/027-team-search.md
 * decisions/373-team-search-header-row.md
 * decisions/535-session-read-needs-no-hydration-wait.md
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
 * The competition and season under the name, or nothing: both or neither.
 *
 * decisions/027-team-search.md
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
  // Which submission is current, so a slow earlier one cannot overwrite a fast
  // later one. A ref, not state: bumping it must not itself cause a re-render.
  const latestSubmission = useRef(0);
  const fieldId = useId();

  // Safe on the first render: better-auth hydrates with the signed-out state the
  // server rendered, and answers with a session it already holds only after that.
  if (!session) return null;

  return (
    // The row's own padding lives here, not in `site-header.tsx`: this component
    // returns `null` for a signed-out reader, and a wrapper would still pad.
    <div className="w-full px-4 pb-3 sm:px-8">
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
            } catch (error) {
              reportClientError(error, "team-search");
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
