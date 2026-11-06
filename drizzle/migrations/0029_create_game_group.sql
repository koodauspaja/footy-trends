CREATE TABLE "game_group" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"invite_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_group_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "game_group_member" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_group_member" ADD CONSTRAINT "game_group_member_group_id_game_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."game_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_group_member" ADD CONSTRAINT "game_group_member_user_id_game_player_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."game_player"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "game_group_member_identity_idx" ON "game_group_member" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "game_group_member_user_idx" ON "game_group_member" USING btree ("user_id");--> statement-breakpoint
CREATE FUNCTION "game_group_delete_when_empty"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	-- The group's row is locked first, so two last members leaving at once are
	-- decided one after the other and the second sees the group empty.
	PERFORM 1 FROM "game_group" WHERE "id" = OLD."group_id" FOR UPDATE;
	DELETE FROM "game_group" WHERE "id" = OLD."group_id"
		AND NOT EXISTS (SELECT 1 FROM "game_group_member" WHERE "group_id" = OLD."group_id");
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "game_group_member_last_out" AFTER DELETE ON "game_group_member"
	FOR EACH ROW EXECUTE FUNCTION "game_group_delete_when_empty"();
