CREATE TABLE "taso_group_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" text NOT NULL,
	"competition_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"level" integer NOT NULL,
	"team_count" integer NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "taso_group_zones_identity_idx" ON "taso_group_zones" USING btree ("category_id","competition_id","season_id","group_id","level");