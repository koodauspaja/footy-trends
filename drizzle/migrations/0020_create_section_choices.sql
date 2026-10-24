CREATE TABLE "section_choice" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"page_kind" text NOT NULL,
	"section" text NOT NULL,
	"open" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "section_choice" ADD CONSTRAINT "section_choice_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "section_choice_identity_idx" ON "section_choice" USING btree ("user_id","page_kind","section");