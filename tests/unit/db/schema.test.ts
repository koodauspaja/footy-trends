import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { matches } from "@/db/schema";

describe("matches table", () => {
  it("declares a unique index on the provider match id and a composite lookup index", () => {
    const { indexes } = getTableConfig(matches);

    expect(indexes).toHaveLength(2);
    expect(indexes[0]?.config).toMatchObject({
      name: "matches_provider_match_id_idx",
      unique: true,
    });
    expect(indexes[1]?.config).toMatchObject({
      name: "matches_competition_season_idx",
      unique: false,
    });
  });
});
