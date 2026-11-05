DROP INDEX "game_ledger_reward_idx";--> statement-breakpoint
ALTER TABLE "game_guess" ADD COLUMN "kickoff_at" timestamp with time zone;--> statement-breakpoint
UPDATE "game_guess" SET "kickoff_at" = coalesce((SELECT "kickoff_at" FROM "taso_matches" WHERE "taso_matches"."taso_match_id" = "game_guess"."taso_match_id"), "made_at");--> statement-breakpoint
ALTER TABLE "game_guess" ALTER COLUMN "kickoff_at" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "game_ledger_settlement_idx" ON "game_ledger" USING btree ("guess_id") WHERE "game_ledger"."kind" in ('reward', 'refund');
