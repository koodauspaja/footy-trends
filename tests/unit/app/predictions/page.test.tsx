import { describe, expect, it, vi } from "vitest";

/**
 * The `/ennusteet` route: what it reads and what it hands the page.
 *
 * decisions/054-prediction-quality.md
 */

const { PredictionQualityPage } = vi.hoisted(() => ({
  PredictionQualityPage: vi.fn(async () => "page"),
}));

vi.mock("@/components/prediction-quality-page", () => ({
  PredictionQualityPage,
  QUALITY_HEADING: "Ennusteiden osuvuus",
}));

import Page, { dynamic, metadata } from "@/app/predictions/page";

describe("/ennusteet", () => {
  it("passes the page's parameters through, rendered per request", async () => {
    await Page({ searchParams: Promise.resolve({ alue: "ulkomaat", tyyppi: "ennakkoon" }) });

    expect(PredictionQualityPage).toHaveBeenCalledWith({
      params: { alue: "ulkomaat", tyyppi: "ennakkoon" },
    });
    expect(dynamic).toBe("force-dynamic");
  });

  it("names the tab as the page", () => {
    expect(metadata.title).toBe("Ennusteiden osuvuus");
  });
});
