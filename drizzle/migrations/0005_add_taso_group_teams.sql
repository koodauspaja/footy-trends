CREATE TABLE "taso_group_teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"team_provider_id" integer NOT NULL,
	"team_name" text NOT NULL,
	"starting_points" integer,
	"points" integer,
	"matches_played" integer,
	"matches_won" integer,
	"matches_tied" integer,
	"matches_lost" integer,
	"goals_for" integer,
	"goals_against" integer,
	"goals_diff" integer,
	"current_standing" integer,
	"final_group_standing" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "taso_group_teams_identity_idx" ON "taso_group_teams" USING btree ("category_id","competition_id","season_id","group_id","team_provider_id");