ALTER TABLE "PublishingLog" ALTER COLUMN "publishedBy" SET DEFAULT 'Operador';
UPDATE "PublishingLog" SET "publishedBy" = 'Operador' WHERE "publishedBy" ILIKE 'fede';
