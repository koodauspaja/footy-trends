import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  account,
  matches,
  session,
  tasoMatches,
  user,
  userAvatar,
  userPreferences,
  verification,
} from "@/db/schema";

describe("matches table", () => {
  it("declares a unique index on the provider match id and four lookup indexes", () => {
    const { indexes } = getTableConfig(matches);

    expect(indexes).toHaveLength(5);
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
    // Added for cup pages, which read one competition, season and stage at a time.
    expect(
      indexes.find((index) => index.config.name === "matches_competition_season_stage_idx")?.config
    ).toMatchObject({
      unique: false,
    });
    // The match page's head-to-head pair lookup. One index serves both
    // orientations — see specs/019-match-page.md.
    const headToHead = indexes.find(
      (index) => index.config.name === "matches_head_to_head_idx"
    )?.config;
    expect(headToHead).toMatchObject({ unique: false });
    expect(headToHead?.columns.map((column) => (column as { name: string }).name)).toEqual([
      "home_team_provider_id",
      "away_team_provider_id",
    ]);
    // The away half of "every match this team played", which the composite
    // above cannot serve on its own. See specs/020-context-free-team-page.md.
    const awaySide = indexes.find((index) => index.config.name === "matches_away_team_idx")?.config;
    expect(awaySide).toMatchObject({ unique: false });
    expect(awaySide?.columns.map((column) => (column as { name: string }).name)).toEqual([
      "away_team_provider_id",
    ]);
  });

  it("carries the cup columns, all nullable so league rows need no backfill", () => {
    const { columns } = getTableConfig(matches);
    const cupColumns = [
      "stage",
      "group_name",
      "regular_time_home",
      "regular_time_away",
      "extra_time_home",
      "extra_time_away",
      "penalties_home",
      "penalties_away",
    ];

    for (const name of cupColumns) {
      const column = columns.find((candidate) => candidate.name === name);
      expect(column, `missing column ${name}`).toBeDefined();
      expect(column?.notNull, `${name} must be nullable`).toBe(false);
    }
  });
});

describe("taso_matches table", () => {
  it("declares a unique index on the taso match id and three lookup indexes", () => {
    const { indexes } = getTableConfig(tasoMatches);

    expect(indexes).toHaveLength(4);
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
    // As on `matches`: the head-to-head pair lookup, both orientations from one
    // index. Measured 3.16 ms → 0.13 ms on 20,604 stored rows.
    const headToHead = indexes.find(
      (index) => index.config.name === "taso_matches_head_to_head_idx"
    )?.config;
    expect(headToHead).toMatchObject({ unique: false });
    expect(headToHead?.columns.map((column) => (column as { name: string }).name)).toEqual([
      "home_team_provider_id",
      "away_team_provider_id",
    ]);
    // Measured on 20,604 stored rows: 1.03 ms without it, 0.20 ms with.
    const awaySide = indexes.find(
      (index) => index.config.name === "taso_matches_away_team_idx"
    )?.config;
    expect(awaySide).toMatchObject({ unique: false });
    expect(awaySide?.columns.map((column) => (column as { name: string }).name)).toEqual([
      "away_team_provider_id",
    ]);
  });
});

describe("better-auth tables", () => {
  it("names the four models better-auth asks for", () => {
    // The Drizzle adapter resolves a model by name; a renamed table fails at
    // the OAuth callback, not at startup. See specs/023-google-oauth-login.md.
    expect([user, session, account, verification].map((t) => getTableConfig(t).name)).toEqual([
      "user",
      "session",
      "account",
      "verification",
    ]);
  });

  it("keeps the property names better-auth indexes this table by", () => {
    // `schemaModel[fieldName]` in the adapter — camelCase keys, whatever the
    // SQL columns are called.
    expect(Object.keys(user)).toEqual(
      expect.arrayContaining(["id", "name", "email", "emailVerified", "image"])
    );
    expect(Object.keys(account)).toEqual(
      expect.arrayContaining(["accountId", "providerId", "userId", "accessToken", "idToken"])
    );
  });

  it("makes a session token unique, since it is the whole basis of authentication", () => {
    const { columns } = getTableConfig(session);
    const token = columns.find((column) => column.name === "token");

    expect(token?.isUnique).toBe(true);
    expect(token?.notNull).toBe(true);
  });

  it("requires an email and keeps it unique across users", () => {
    const email = getTableConfig(user).columns.find((column) => column.name === "email");

    expect(email?.isUnique).toBe(true);
    expect(email?.notNull).toBe(true);
  });

  it("cascades sessions and accounts away with their user", () => {
    for (const table of [session, account]) {
      const [foreignKey] = getTableConfig(table).foreignKeys;

      expect(foreignKey?.onDelete).toBe("cascade");

      // Resolving the reference is what proves it points at `user.id` and not
      // merely at something; Drizzle defers it in a callback, so an unresolved
      // reference is a foreign key nobody has ever checked the target of.
      const reference = foreignKey?.reference();
      expect(reference?.foreignTable).toBe(user);
      expect(reference?.foreignColumns.map((column) => column.name)).toEqual(["id"]);
    }
  });

  it("stops one Google account attaching to two users", () => {
    const { indexes } = getTableConfig(account);
    const identity = indexes.find(
      (index) => index.config.name === "account_provider_account_idx"
    )?.config;

    expect(identity).toMatchObject({ unique: true });
    expect(identity?.columns.map((column) => (column as { name: string }).name)).toEqual([
      "provider_id",
      "account_id",
    ]);
  });

  it("indexes the user id both tables are read by", () => {
    expect(
      getTableConfig(session).indexes.find((i) => i.config.name === "session_user_id_idx")
    ).toBeDefined();
    expect(
      getTableConfig(account).indexes.find((i) => i.config.name === "account_user_id_idx")
    ).toBeDefined();
  });
});

describe("user_preferences table", () => {
  it("holds one row per reader", () => {
    // Unique, not merely indexed: a second row would make "the reader's
    // preferences" ambiguous. See specs/024-account-settings.md.
    const userId = getTableConfig(userPreferences).columns.find(
      (column) => column.name === "user_id"
    );

    expect(userId?.isUnique).toBe(true);
    expect(userId?.notNull).toBe(true);
  });

  it("cascades away with its user, leaving no orphaned preferences", () => {
    const [foreignKey] = getTableConfig(userPreferences).foreignKeys;

    expect(foreignKey?.onDelete).toBe("cascade");

    const reference = foreignKey?.reference();
    expect(reference?.foreignTable).toBe(user);
    expect(reference?.foreignColumns.map((column) => column.name)).toEqual(["id"]);
  });

  it("leaves every preference nullable, so each one can be unset", () => {
    // Null means "no preference", which is not the same as "prefers today's
    // default". It is also what makes no setting a one-way door.
    const optional = getTableConfig(userPreferences).columns.filter((column) =>
      column.name.startsWith("default_")
    );

    expect(optional).toHaveLength(4);
    for (const column of optional) expect(column.notNull).toBe(false);
  });
});

describe("user_avatar table", () => {
  it("stores the image as bytea, not as text", () => {
    // drizzle has no built-in `bytea`, so this column is a `customType` whose
    // whole job is that one word. Encoded as text, a WebP would come back
    // corrupt — and the round trip is only proved against a real database in
    // tests/integration/avatar.test.ts, which cannot say what the *declared*
    // type is.
    const { columns } = getTableConfig(userAvatar);
    const bytes = columns.find((column) => column.name === "bytes");

    expect(bytes?.getSQLType()).toBe("bytea");
    expect(bytes?.notNull).toBe(true);
  });

  it("keys on the user, so an upload replaces rather than accumulates", () => {
    const { columns, foreignKeys } = getTableConfig(userAvatar);

    expect(columns.find((column) => column.name === "user_id")?.primary).toBe(true);
    // The cascade is what makes account deletion complete without a second
    // code path — specs/024 promises it is irreversible and total.
    expect(foreignKeys[0]?.onDelete).toBe("cascade");
    // Resolved rather than read off the config: which table it cascades *from*
    // is the whole guarantee, and a reference pointing somewhere else would
    // satisfy every assertion above.
    const reference = foreignKeys[0]?.reference();
    expect(reference?.foreignTable).toBe(user);
    expect(reference?.foreignColumns.map((column) => column.name)).toEqual(["id"]);
  });
});
