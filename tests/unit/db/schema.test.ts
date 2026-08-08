import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { matches } from "@/db/schema";

describe("matches table", () => {
  it("declares a unique index on the provider match id and a composite lookup index", () => {
    const { indexes } = getTableConfig(matches);

    expect(indexes).toHaveLength(2);
    expect(
      indexes.find((index) => index.config.name === "matches_provider_match_id_idx")?.config
    ).toMatchObject({
      unique: true,
    });
    expect(
      indexes.find((index) => index.config.name === "matches_competition_season_idx")?.config
    ).toMatchObject({
      unique: false,
    });
  });
});
