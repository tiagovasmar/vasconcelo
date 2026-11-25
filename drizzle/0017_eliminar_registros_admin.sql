CREATE TABLE "admin_record_archives" (
	"kind" text NOT NULL,
	"record_id" text NOT NULL,
	"archived_at" bigint,
	"updated_at" bigint NOT NULL,
	"updated_by_email" text NOT NULL,
	CONSTRAINT "admin_record_archives_kind_record_id_pk" PRIMARY KEY("kind","record_id"),
	CONSTRAINT "admin_record_archives_kind" CHECK ("admin_record_archives"."kind" in ('purchase', 'wholesale'))
);
