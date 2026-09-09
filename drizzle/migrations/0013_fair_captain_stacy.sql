CREATE TABLE "favorite_competition" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"region" text NOT NULL,
	"competition_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite_team" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"team_provider_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "favorite_competition" ADD CONSTRAINT "favorite_competition_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_team" ADD CONSTRAINT "favorite_team_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_competition_identity_idx" ON "favorite_competition" USING btree ("user_id","region","competition_code");--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_team_identity_idx" ON "favorite_team" USING btree ("user_id","source","team_provider_id");