ALTER TABLE "game_season_guess" ADD COLUMN "changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_season_guess" ADD COLUMN "lock_at" timestamp with time zone NOT NULL;