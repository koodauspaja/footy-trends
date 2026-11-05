CREATE TABLE "game_season_guess" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"kind" text NOT NULL,
	"teams" integer[] NOT NULL,
	"made_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"reward" integer,
	"right_count" integer,
	"near_count" integer
);
--> statement-breakpoint
ALTER TABLE "game_ledger" ADD COLUMN "season_guess_id" integer;--> statement-breakpoint
ALTER TABLE "game_season_guess" ADD CONSTRAINT "game_season_guess_user_id_game_player_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."game_player"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_season_guess_identity_idx" ON "game_season_guess" USING btree ("user_id","season_id","kind");--> statement-breakpoint
ALTER TABLE "game_ledger" ADD CONSTRAINT "game_ledger_season_guess_id_game_season_guess_id_fk" FOREIGN KEY ("season_guess_id") REFERENCES "public"."game_season_guess"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_ledger_season_price_idx" ON "game_ledger" USING btree ("season_guess_id") WHERE "game_ledger"."kind" = 'season-guess';--> statement-breakpoint
CREATE UNIQUE INDEX "game_ledger_season_settlement_idx" ON "game_ledger" USING btree ("season_guess_id") WHERE "game_ledger"."kind" in ('season-reward', 'season-refund');