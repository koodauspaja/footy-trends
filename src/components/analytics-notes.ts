/**
 * Lines more than one block prints word for word. They sit apart from every
 * block, so any block can import them without importing another block.
 *
 * decisions/048-league-goals-per-game-trend.md
 * decisions/049-home-advantage-and-draw-rate.md
 * decisions/057-surprise-index.md
 * decisions/811-no-import-cycles.md
 */

export const IN_PROGRESS_NOTE = "(kesken)";
export const ROUNDING_NOTE =
  "Osuudet on pyöristetty, joten niiden summa voi poiketa 100 prosentista.";

/**
 * The line naming the season in progress above its surprises.
 *
 * decisions/057-surprise-index.md
 */
export function inProgressSeasonLine(label: string): string {
  return `Kausi ${label} ${IN_PROGRESS_NOTE}`;
}
