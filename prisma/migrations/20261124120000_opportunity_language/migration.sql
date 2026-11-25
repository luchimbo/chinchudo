-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN "language" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Opportunity_clientId_language_idx" ON "Opportunity"("clientId", "language");
