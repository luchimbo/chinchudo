ALTER TABLE "BlogPublication" ADD COLUMN "preparation" JSONB;
ALTER TABLE "BlogPublication" ADD COLUMN "errorCode" TEXT NOT NULL DEFAULT '';
