import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { CompetitionSelect } from "@/components/competition-select";
import { RoundSelect } from "@/components/round-select";
import { SeasonSelect } from "@/components/season-select";
import { StageSelect } from "@/components/stage-select";

/**
 * Every labelled select is one item of its row, so a row that wraps never
 * leaves a label at the end of one line and its select at the start of the next.
 *
 * decisions/696-headings-and-spacing.md
 */

const ignore = () => undefined;

const PAIRS: ReadonlyArray<readonly [string, ReactElement]> = [
  [
    "Kausi",
    <SeasonSelect
      key="season"
      onChange={ignore}
      seasons={[{ seasonId: 2026, label: "2026" }]}
      selectedSeasonId={2026}
    />,
  ],
  [
    "Kierros",
    <RoundSelect availableRounds={[1, 2]} key="round" onChange={ignore} selectedRound={1} />,
  ],
  [
    "Vaihe",
    <StageSelect
      availableStages={["GROUP_STAGE"]}
      key="stage"
      onChange={ignore}
      selectedStage="GROUP_STAGE"
    />,
  ],
  [
    "Kilpailu",
    <CompetitionSelect
      competitions={[
        {
          code: "PL",
          name: "Valioliiga",
          flagUrl: "https://crests.football-data.org/770.svg",
          country: "Englanti",
          format: "league",
          region: "foreign",
        },
      ]}
      key="competition"
      onChange={ignore}
      selectedCompetitionCode="PL"
    />,
  ],
];

describe("A labelled select", () => {
  for (const [label, element] of PAIRS) {
    it(`keeps ${label} and its select in one item of the row`, () => {
      const { container } = render(<div className="flex flex-wrap">{element}</div>);

      const select = screen.getByLabelText(label);
      const item = select.parentElement;
      expect(item?.parentElement).toBe(container.firstElementChild);
      expect(item).toHaveClass("flex");
      expect(item?.querySelector("label")?.textContent?.trim()).toBe(label);
    });
  }
});
