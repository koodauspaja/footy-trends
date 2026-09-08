"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Notice } from "@/components/notice";
import {
  removeFavouriteCompetitionAction,
  removeFavouriteTeamAction,
} from "@/lib/favourite-actions";
import type { FavouriteSource } from "@/lib/favourite-keys";
import type { RegionSegment } from "@/lib/regions";

/**
 * `/suosikit` for a signed-in reader, from specs/026-favourites.md.
 *
 * The lists arrive resolved from the server — names from stored matches,
 * competitions checked against the registry — because this page is the one
 * place that shows what a favourite *is* rather than only whether it is one.
 */

export type FavouriteTeamEntry = {
  source: FavouriteSource;
  teamProviderId: number;
  name: string | null;
  href: string | null;
};

export type FavouriteCompetitionEntry = {
  region: RegionSegment;
  code: string;
  name: string | null;
  href: string;
};

type Props = Readonly<{
  teams: FavouriteTeamEntry[];
  competitions: FavouriteCompetitionEntry[];
}>;

const SECTION_CLASS = "mb-8";
const HEADING_CLASS = "mb-3 font-medium text-lg";
const REMOVE_CLASS =
  "rounded border border-border px-2 py-1 text-sm hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50";

export function FavouritesPage({ teams, competitions }: Props) {
  const [failed, setFailed] = useState(false);
  const [removedKeys, setRemovedKeys] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function remove(key: string, run: () => Promise<{ ok: boolean }>) {
    setFailed(false);
    startTransition(async () => {
      try {
        const outcome = await run();
        // Hidden locally rather than by a reload: the row is gone as far as the
        // reader is concerned, and the server has already been told.
        if (outcome.ok) setRemovedKeys((keys) => [...keys, key]);
        else setFailed(true);
      } catch {
        setFailed(true);
      }
    });
  }

  const visibleCompetitions = competitions.filter(
    (entry) => !removedKeys.includes(`c:${entry.region}:${entry.code}`)
  );
  const visibleTeams = teams.filter(
    (entry) => !removedKeys.includes(`t:${entry.source}:${entry.teamProviderId}`)
  );

  return (
    <>
      <section className={SECTION_CLASS}>
        <h2 className={HEADING_CLASS}>Sarjat</h2>
        {visibleCompetitions.length === 0 ? (
          <p className="text-muted text-sm">Ei suosikkisarjoja. Lisää niitä sarjan sivulta.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleCompetitions.map((entry) => (
              <li className="flex items-center gap-3 text-sm" key={`${entry.region}:${entry.code}`}>
                {/* A competition retired from the registry has no name and no
                    page left to link to, but it still has a row to remove. */}
                {entry.name === null ? (
                  <span className="text-muted">Sarjaa ei enää ole.</span>
                ) : (
                  <Link className="hover:underline" href={entry.href}>
                    {entry.name}
                  </Link>
                )}
                <button
                  className={REMOVE_CLASS}
                  disabled={pending}
                  onClick={() =>
                    remove(`c:${entry.region}:${entry.code}`, () =>
                      removeFavouriteCompetitionAction(entry.region, entry.code)
                    )
                  }
                  type="button"
                >
                  Poista suosikeista
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={SECTION_CLASS}>
        <h2 className={HEADING_CLASS}>Joukkueet</h2>
        {visibleTeams.length === 0 ? (
          <p className="text-muted text-sm">
            Ei suosikkijoukkueita. Lisää niitä joukkueen sivulta.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleTeams.map((entry) => (
              <li
                className="flex items-center gap-3 text-sm"
                key={`${entry.source}:${entry.teamProviderId}`}
              >
                {/* Three cases, not two. No stored matches means no name at
                    all. A name without a page — a competition the registry no
                    longer has, so its region is unknown — is still worth
                    showing: "not found" would be a false statement about a team
                    we just named. Either way the entry stays removable. */}
                {entry.name === null ? (
                  <span className="text-muted">Joukkuetta ei löytynyt.</span>
                ) : entry.href === null ? (
                  <span>{entry.name}</span>
                ) : (
                  <Link className="hover:underline" href={entry.href}>
                    {entry.name}
                  </Link>
                )}
                <button
                  className={REMOVE_CLASS}
                  disabled={pending}
                  onClick={() =>
                    remove(`t:${entry.source}:${entry.teamProviderId}`, () =>
                      removeFavouriteTeamAction(entry.source, entry.teamProviderId)
                    )
                  }
                  type="button"
                >
                  Poista suosikeista
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {failed && <Notice>Poistaminen epäonnistui. Yritä uudelleen.</Notice>}
    </>
  );
}
