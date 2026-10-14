/**
 * A grid of scorelines, one side's goals down and the other's across, `0`–`4`
 * and `5+`, each cell shaded by its level: `Tulokset` on the head-to-head page
 * and the Poisson grid in `Ennuste`.
 *
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/062-scoreline-probability-grid.md
 */

import { SCORE_GRID_CAP } from "@/lib/head-to-head";

/**
 * An axis label: the number of goals, or `5+` for the capped last row and column.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export function goalsLabel(goals: number): string {
  return goals === SCORE_GRID_CAP ? `${SCORE_GRID_CAP}+` : String(goals);
}

/**
 * How many shading steps a filled cell can take, light to dark.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
const SHADE_STEPS = [18, 38, 62, 85] as const;

/**
 * How dark a cell is: 0 for an empty one, else 1–4 by its share of the fullest
 * cell. The count is printed in every filled cell too.
 *
 * decisions/044-scorelines-and-goal-averages.md
 */
export function shadeLevel(count: number, largest: number): number {
  if (count === 0) return 0;
  return Math.ceil((count / largest) * SHADE_STEPS.length);
}

/**
 * One cell: its shading level, 0–4, and what it prints. `marked` outlines it
 * and prints it bold.
 *
 * decisions/062-scoreline-probability-grid.md
 */
export type ScoreGridCell = { level: number; text: string; marked?: boolean };

/**
 * A marked cell's outline: the foreground with a ring of the background inside
 * it, so it shows on the lightest cell and on the darkest.
 *
 * decisions/062-scoreline-probability-grid.md
 */
const MARKED_STYLE = {
  outline: "2px solid var(--color-foreground)",
  outlineOffset: "-2px",
  boxShadow: "inset 0 0 0 4px var(--color-background)",
} as const;

function ScoreCell({ level, text, marked = false }: Readonly<ScoreGridCell>) {
  const mix = SHADE_STEPS[level - 1];
  return (
    <td
      className={`h-9 w-10 border border-border-subtle text-center ${level >= 3 ? "text-background" : ""} ${marked ? "font-bold" : ""}`}
      data-level={level}
      data-marked={marked ? "" : undefined}
      style={{
        ...(mix === undefined
          ? {}
          : {
              backgroundColor: `color-mix(in oklab, var(--color-foreground) ${mix}%, var(--color-background))`,
            }),
        ...(marked ? MARKED_STYLE : {}),
      }}
    >
      {text}
    </td>
  );
}

/**
 * The grid as a table: `corner` names the two axes, and `rows` runs down the
 * first side's goals, each row across the second's.
 *
 * decisions/044-scorelines-and-goal-averages.md
 * decisions/062-scoreline-probability-grid.md
 */
export function ScoreGridTable({
  corner,
  rows,
}: Readonly<{ corner: string; rows: readonly (readonly ScoreGridCell[])[] }>) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-sm tabular-nums">
        <thead>
          <tr>
            <th className="p-2 text-left font-normal text-muted text-xs" scope="col">
              {corner}
            </th>
            {rows.map((_row, goals) => (
              <th className="w-10 p-2 text-center font-medium" key={goalsLabel(goals)} scope="col">
                {goalsLabel(goals)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, first) => (
            <tr key={goalsLabel(first)}>
              <th className="p-2 text-right font-medium" scope="row">
                {goalsLabel(first)}
              </th>
              {row.map((cell, second) => (
                <ScoreCell key={goalsLabel(second)} {...cell} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
