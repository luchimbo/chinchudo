CREATE TYPE "ContentIntent" AS ENUM ('SALE', 'EDUCATION', 'USE_CASE', 'ENTERTAINMENT');
CREATE TYPE "ContentIdeaStatus" AS ENUM ('REVIEW', 'APPROVED', 'SCRIPT_READY', 'READY_TO_RECORD', 'RECORDED', 'PUBLISHED', 'DISCARDED');

ALTER TABLE "Trend"
  ADD COLUMN "analysisStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "viabilityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "viralFormula" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "suggestedProductId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "suggestedAngle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "visualDirection" TEXT NOT NULL DEFAULT '';

CREATE TABLE "ContentIdea" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "trendId" TEXT,
  "intent" "ContentIntent" NOT NULL,
  "format" TEXT NOT NULL,
  "hook" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "visualDirection" TEXT NOT NULL,
  "viabilityScore" INTEGER NOT NULL DEFAULT 3,
  "status" "ContentIdeaStatus" NOT NULL DEFAULT 'REVIEW',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VideoScript" ADD COLUMN "contentIdeaId" TEXT;
CREATE INDEX "ContentIdea_clientId_status_idx" ON "ContentIdea"("clientId", "status");
CREATE INDEX "ContentIdea_productId_idx" ON "ContentIdea"("productId");
CREATE INDEX "ContentIdea_trendId_idx" ON "ContentIdea"("trendId");
CREATE INDEX "ContentIdea_createdAt_idx" ON "ContentIdea"("createdAt");
CREATE INDEX "VideoScript_contentIdeaId_idx" ON "VideoScript"("contentIdeaId");

ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "Trend"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "VideoScript" ADD CONSTRAINT "VideoScript_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContentIdea" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "ContentIdea" FROM anon, authenticated;
