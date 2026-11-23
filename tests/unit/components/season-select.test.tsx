import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NO_MATCHES, SeasonSelect } from "@/components/season-select";

/**
 * The season `<select>` every page shares: a season with no matches yet is
 * listed, greyed out and not choosable.
 *
 * decisions/878-empty-season-not-selectable.md
 */

describe("SeasonSelect", () => {
  it("lists a season with no matches as a disabled option that says so", () => {
    render(
      <SeasonSelect
        onChange={vi.fn()}
        seasons={[
          { seasonId: 2027, label: "2027", noMatches: true },
          { seasonId: 2026, label: "2026" },
        ]}
        selectedSeasonId={2026}
      />
    );

    const empty = screen.getByRole("option", { name: "2027 – Ei otteluita tällä kaudella" });
    const played = screen.getByRole("option", { name: "2026" });
    expect(NO_MATCHES).toBe("Ei otteluita tällä kaudella");
    expect(empty).toHaveProperty("disabled", true);
    expect(played).toHaveProperty("disabled", false);
    expect(screen.getByLabelText("Kausi")).toHaveProperty("value", "2026");
  });
});
