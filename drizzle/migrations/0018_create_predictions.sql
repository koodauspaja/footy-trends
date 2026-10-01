CREATE TABLE "predictions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"provider_match_id" integer NOT NULL,
	"competition_code" text NOT NULL,
	"model" text NOT NULL,
	"kind" text NOT NULL,
	"home_probability" double precision NOT NULL,
	"draw_probability" double precision NOT NULL,
	"away_probability" double precision NOT NULL,
	"predicted_at" timestamp with time zone NOT NULL,
	"kickoff_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "predictions_identity_idx" ON "predictions" USING btree ("source","provider_match_id","model","kind");