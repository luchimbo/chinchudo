ALTER TABLE "Opportunity" ADD COLUMN "opportunityScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Opportunity" ADD COLUMN "contextAssessment" JSONB NOT NULL DEFAULT '{}';

CREATE INDEX "Opportunity_opportunityScore_createdAt_idx" ON "Opportunity"("opportunityScore" DESC, "createdAt" DESC);
