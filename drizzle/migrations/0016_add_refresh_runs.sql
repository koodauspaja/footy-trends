CREATE TABLE "refresh_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"competition_code" text NOT NULL,
	"season_id" integer NOT NULL,
	"season_label" text,
	"status" text NOT NULL,
	"reason" text,
	"matches_inserted" integer DEFAULT 0 NOT NULL,
	"matches_updated" integer DEFAULT 0 NOT NULL,
	"matches_deleted" integer DEFAULT 0 NOT NULL,
	"group_rows_inserted" integer,
	"group_rows_updated" integer,
	"group_rows_deleted" integer,
	"deductions_changed" integer DEFAULT 0 NOT NULL,
	"run_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "refresh_runs" ADD CONSTRAINT "refresh_runs_run_by_user_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;