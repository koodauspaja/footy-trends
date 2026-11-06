ALTER TABLE "game_season_guess" ADD COLUMN "changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_season_guess" ADD COLUMN "lock_at" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE INDEX "game_season_guess_season_idx" ON "game_season_guess" USING btree ("season_id","kind");--> statement-breakpoint
CREATE INDEX "game_season_guess_open_idx" ON "game_season_guess" USING btree ("season_id") WHERE "game_season_guess"."settled_at" is null;