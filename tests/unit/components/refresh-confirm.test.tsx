import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RefreshConfirm } from "@/components/refresh-confirm";
import { NO_CHANGES, REMOVED_MATCHES_SHOWN, type RefreshPreview } from "@/lib/refresh-view";

/**
 * The dialog that stands between a truncated provider answer and a deleted
 * season, from specs/029-forced-season-refresh.md.
 *
 * A partial answer is indistinguishable from a season that genuinely lost
 * fixtures, so nothing in the code can separate them. What separates them is a
 * person reading this. Which is why the removals are asserted here by **name**
 * rather than by count.
 */

function preview(overrides: Partial<RefreshPreview> = {}): RefreshPreview {
  return {
    source: "taso",
    competitionCode: "VL",
    competitionName: "Veikkausliiga",
    seasonId: 2016,
    seasonLabel: "2016",
    matches: NO_CHANGES,
    groupRows: NO_CHANGES,
    deductionChanges: [],
    removedMatches: [],
    snapshotHash: "hash",
    ...overrides,
  };
}

function removedMatch(id: number) {
  return {
    providerMatchId: id,
    kickoffAt: "2016-08-01T15:00:00.000Z",
    homeTeamName: `Koti ${id}`,
    awayTeamName: `Vieras ${id}`,
  };
}

const noop = () => undefined;

describe("RefreshConfirm", () => {
  it("names the competition and season it is about", () => {
    render(<RefreshConfirm onCancel={noop} onConfirm={noop} pending={false} preview={preview()} />);

    expect(screen.getByRole("heading", { name: "Näin tiedot muuttuisivat" })).toBeInTheDocument();
    expect(screen.getByText("Veikkausliiga 2016")).toBeInTheDocument();
  });

  it("offers no way to apply when nothing would change", () => {
    render(<RefreshConfirm onCancel={noop} onConfirm={noop} pending={false} preview={preview()} />);

    expect(
      screen.getByText("Tiedot ovat jo ajan tasalla. Mitään ei muuttuisi.")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Päivitä" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sulje" })).toBeInTheDocument();
  });

  it("lists only the counts that are not zero", () => {
    render(
      <RefreshConfirm
        onCancel={noop}
        onConfirm={noop}
        pending={false}
        preview={preview({ matches: { inserted: 2, updated: 0, deleted: 0 } })}
      />
    );

    expect(screen.getByText("Uusia otteluita: 2")).toBeInTheDocument();
    expect(screen.queryByText(/Muuttuvia otteluita/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Poistuvia otteluita/)).not.toBeInTheDocument();
  });

  it("counts the standings separately from the matches", () => {
    render(
      <RefreshConfirm
        onCancel={noop}
        onConfirm={noop}
        pending={false}
        preview={preview({ groupRows: { inserted: 0, updated: 3, deleted: 1 } })}
      />
    );

    expect(screen.getByText("Muuttuvia sarjataulukkorivejä: 3")).toBeInTheDocument();
    expect(screen.getByText("Poistuvia sarjataulukkorivejä: 1")).toBeInTheDocument();
  });

  it("shows every deduction that would move, old to new", () => {
    render(
      <RefreshConfirm
        onCancel={noop}
        onConfirm={noop}
        pending={false}
        preview={preview({
          matches: { inserted: 1, updated: 0, deleted: 0 },
          deductionChanges: [
            { teamName: "PK-35 Vantaa", from: 0, to: -6 },
            // A team with nothing stored, and a team losing the value it had:
            // both ends are nullable and both render as a dash.
            { teamName: "Uusi", from: null, to: -3 },
            { teamName: "Poistuva", from: -3, to: null },
          ],
        })}
      />
    );

    expect(screen.getByText("PK-35 Vantaa: 0 → -6")).toBeInTheDocument();
    expect(screen.getByText("Uusi: – → -3")).toBeInTheDocument();
    expect(screen.getByText("Poistuva: -3 → –")).toBeInTheDocument();
  });

  it("names the matches that would be removed", () => {
    // The whole point of the dialog: a number is not enough to judge a deletion
    // by, and deletion is the only irreversible thing this tool does.
    render(
      <RefreshConfirm
        onCancel={noop}
        onConfirm={noop}
        pending={false}
        preview={preview({
          matches: { inserted: 0, updated: 0, deleted: 1 },
          removedMatches: [removedMatch(1)],
        })}
      />
    );

    expect(screen.getByText("1.8.2016 Koti 1–Vieras 1")).toBeInTheDocument();
  });

  it("truncates a long removal list and says how many are hidden", () => {
    const removed = Array.from({ length: REMOVED_MATCHES_SHOWN + 5 }, (_, i) => removedMatch(i));
    render(
      <RefreshConfirm
        onCancel={noop}
        onConfirm={noop}
        pending={false}
        preview={preview({
          matches: { inserted: 0, updated: 0, deleted: removed.length },
          removedMatches: removed,
        })}
      />
    );

    expect(screen.getByText("…ja 5 muuta.")).toBeInTheDocument();
    expect(screen.getAllByText(/Koti \d+–Vieras \d+/)).toHaveLength(REMOVED_MATCHES_SHOWN);
  });

  it("asks before applying, and reports both answers", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <RefreshConfirm
        onCancel={onCancel}
        onConfirm={onConfirm}
        pending={false}
        preview={preview({ matches: { inserted: 1, updated: 0, deleted: 0 } })}
      />
    );

    expect(screen.getByText("Haluatko päivittää?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Päivitä" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Peruuta" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons while the apply is in flight", () => {
    render(
      <RefreshConfirm
        onCancel={noop}
        onConfirm={noop}
        pending={true}
        preview={preview({ matches: { inserted: 1, updated: 0, deleted: 0 } })}
      />
    );

    expect(screen.getByRole("button", { name: "Päivitetään…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Peruuta" })).toBeDisabled();
  });

  it("offers Päivitä for a deduction change alone", () => {
    // The one thing this feature exists to apply must not be the thing the
    // button forgets.
    render(
      <RefreshConfirm
        onCancel={noop}
        onConfirm={noop}
        pending={false}
        preview={preview({
          deductionChanges: [{ teamName: "PK-35 Vantaa", from: 0, to: -6 }],
        })}
      />
    );

    expect(screen.getByRole("button", { name: "Päivitä" })).toBeInTheDocument();
    expect(screen.queryByText("Tiedot ovat jo ajan tasalla. Mitään ei muuttuisi.")).toBeNull();
  });

  it("is a dialog labelled by its own heading", () => {
    render(<RefreshConfirm onCancel={noop} onConfirm={noop} pending={false} preview={preview()} />);

    expect(screen.getByRole("dialog", { name: "Näin tiedot muuttuisivat" })).toBeInTheDocument();
  });
});
