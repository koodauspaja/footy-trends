CREATE TABLE "game_guess" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"taso_match_id" integer NOT NULL,
	"kind" text NOT NULL,
	"outcome" text,
	"home_goals" integer,
	"away_goals" integer,
	"free" boolean DEFAULT false NOT NULL,
	"made_at" timestamp with time zone NOT NULL,
	"settled_at" timestamp with time zone,
	"tier" text
);
--> statement-breakpoint
CREATE TABLE "game_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"season_id" integer NOT NULL,
	"kind" text NOT NULL,
	"amount" integer NOT NULL,
	"guess_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_player" (
	"user_id" text PRIMARY KEY NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_guess" ADD CONSTRAINT "game_guess_user_id_game_player_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."game_player"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_ledger" ADD CONSTRAINT "game_ledger_user_id_game_player_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."game_player"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_ledger" ADD CONSTRAINT "game_ledger_guess_id_game_guess_id_fk" FOREIGN KEY ("guess_id") REFERENCES "public"."game_guess"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_player" ADD CONSTRAINT "game_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_guess_identity_idx" ON "game_guess" USING btree ("user_id","taso_match_id");--> statement-breakpoint
CREATE INDEX "game_guess_open_idx" ON "game_guess" USING btree ("taso_match_id") WHERE "game_guess"."settled_at" is null;--> statement-breakpoint
CREATE INDEX "game_ledger_balance_idx" ON "game_ledger" USING btree ("user_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "game_ledger_grant_idx" ON "game_ledger" USING btree ("user_id","season_id") WHERE "game_ledger"."kind" = 'grant';--> statement-breakpoint
CREATE UNIQUE INDEX "game_ledger_reward_idx" ON "game_ledger" USING btree ("guess_id") WHERE "game_ledger"."kind" = 'reward';