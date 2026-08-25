import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { matches, tasoMatches } from "@/db/schema";

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

describe("taso_matches table", () => {
  it("declares a unique index on the taso match id and a composite lookup index", () => {
    const { indexes } = getTableConfig(tasoMatches);

    expect(indexes).toHaveLength(2);
    expect(
      indexes.find((index) => index.config.name === "taso_matches_taso_match_id_idx")?.config
    ).toMatchObject({
      unique: true,
    });
    const lookup = indexes.find(
      (index) => index.config.name === "taso_matches_category_competition_season_group_idx"
    )?.config;
    expect(lookup).toMatchObject({ unique: false });
    // Category first: it is what separates one competition's rows from
    // another's, since `competition_id` is shared and `group_id` collides.
    expect(lookup?.columns.map((column) => (column as { name: string }).name)).toEqual([
      "category_id",
      "competition_id",
      "season_id",
      "group_id",
    ]);
  });
});
