ALTER TABLE "matches" ALTER COLUMN "home_goals" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ALTER COLUMN "away_goals" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN "status" text DEFAULT 'FINISHED' NOT NULL;