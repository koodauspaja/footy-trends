DROP INDEX "taso_matches_competition_season_group_idx";--> statement-breakpoint
-- Every existing row is Veikkausliiga: `taso_matches` only ever held one
-- category, which is why the column was not needed until now. The default
-- exists solely to backfill those rows, and is dropped immediately after —
-- every insert supplies the value. See specs/013-more-finnish-competitions.md.
ALTER TABLE "taso_matches" ADD COLUMN "category_id" text DEFAULT 'VL' NOT NULL;--> statement-breakpoint
ALTER TABLE "taso_matches" ALTER COLUMN "category_id" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "taso_matches_category_competition_season_group_idx" ON "taso_matches" USING btree ("category_id","competition_id","season_id","group_id");
