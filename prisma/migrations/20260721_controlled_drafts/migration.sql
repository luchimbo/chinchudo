ALTER TABLE "Client" ADD COLUMN "dailyDraftTarget" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "Client" ADD COLUMN "responsePolicy" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Client" ALTER COLUMN "dailyOpportunityTarget" SET DEFAULT 50;

ALTER TABLE "Response" ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '[]';

CREATE TYPE "DraftJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "CompetitorEvidence" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "competitorBrand" TEXT NOT NULL,
  "aliases" JSONB NOT NULL DEFAULT '[]',
  "model" TEXT NOT NULL DEFAULT '',
  "topic" TEXT NOT NULL,
  "observation" TEXT NOT NULL,
  "testedBy" TEXT NOT NULL DEFAULT '',
  "testedAt" TIMESTAMP(3),
  "evidenceUrl" TEXT NOT NULL DEFAULT '',
  "confidence" TEXT NOT NULL DEFAULT 'medium',
  "allowFirstPerson" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CompetitorEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CompetitorEvidence_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "DraftJob" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "status" "DraftJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lockedBy" TEXT NOT NULL DEFAULT '',
  "leaseUntil" TIMESTAMP(3),
  "lastError" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DraftJob_opportunityId_key" UNIQUE ("opportunityId"),
  CONSTRAINT "DraftJob_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "DraftJob_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CompetitorEvidence_clientId_competitorBrand_idx" ON "CompetitorEvidence"("clientId", "competitorBrand");
CREATE INDEX "CompetitorEvidence_clientId_active_idx" ON "CompetitorEvidence"("clientId", "active");
CREATE INDEX "DraftJob_clientId_status_createdAt_idx" ON "DraftJob"("clientId", "status", "createdAt");
CREATE INDEX "DraftJob_status_leaseUntil_idx" ON "DraftJob"("status", "leaseUntil");

ALTER TABLE "CompetitorEvidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DraftJob" ENABLE ROW LEVEL SECURITY;
