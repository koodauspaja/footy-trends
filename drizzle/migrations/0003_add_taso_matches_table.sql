CREATE TABLE "taso_matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"taso_match_id" integer NOT NULL,
	"competition_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"group_name" text NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL,
	"matchday" integer,
	"status" text NOT NULL,
	"home_team_provider_id" integer NOT NULL,
	"home_team_name" text NOT NULL,
	"away_team_provider_id" integer NOT NULL,
	"away_team_name" text NOT NULL,
	"home_goals" integer,
	"away_goals" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "taso_matches_taso_match_id_idx" ON "taso_matches" USING btree ("taso_match_id");--> statement-breakpoint
CREATE INDEX "taso_matches_competition_season_group_idx" ON "taso_matches" USING btree ("competition_id","season_id","group_id");