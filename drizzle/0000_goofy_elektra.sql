CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"token_id" text NOT NULL,
	"user_id" text NOT NULL,
	"room_id" text,
	"scanned_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "qr_token" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"room_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"used_by_user_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"created_by" text NOT NULL,
	CONSTRAINT "qr_token_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_token_id_qr_token_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."qr_token"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_user_token_idx" ON "attendance" USING btree ("user_id","token_id");