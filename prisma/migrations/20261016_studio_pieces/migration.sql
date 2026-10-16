ALTER TABLE "ContentIdea" ADD COLUMN "pieceType" TEXT NOT NULL DEFAULT 'REEL';
ALTER TABLE "ContentIdea" ADD COLUMN "plannedFor" DATE;
ALTER TABLE "ContentIdea" ADD COLUMN "formulaId" INTEGER;
ALTER TABLE "ContentIdea" ADD COLUMN "publishedUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ContentIdea" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "ContentIdea" ADD COLUMN "extras" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ContentIdea" ADD COLUMN "notes" TEXT NOT NULL DEFAULT '';
CREATE INDEX "ContentIdea_clientId_plannedFor_idx" ON "ContentIdea"("clientId", "plannedFor");
