CREATE TABLE "BusinessProfile" (
  "id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT NOT NULL UNIQUE,
  "sourceUrl" TEXT NOT NULL DEFAULT '', "data" JSONB NOT NULL DEFAULT '{}',
  "monthlyEnabled" BOOLEAN NOT NULL DEFAULT true, "nextAnalysisAt" TIMESTAMP(3), "lastSuccessfulAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "BusinessCompetitor" (
  "id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT NOT NULL, "domain" TEXT NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '', "sourceUrl" TEXT NOT NULL DEFAULT '', "excluded" BOOLEAN NOT NULL DEFAULT false,
  "manual" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessCompetitor_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BusinessProfile_monthlyEnabled_nextAnalysisAt_idx" ON "BusinessProfile"("monthlyEnabled", "nextAnalysisAt");
CREATE UNIQUE INDEX "BusinessCompetitor_clientId_domain_key" ON "BusinessCompetitor"("clientId", "domain");
CREATE TABLE "BusinessAnalysisRun" (
  "id" TEXT NOT NULL PRIMARY KEY, "clientId" TEXT NOT NULL, "sourceUrl" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'QUEUED', "stage" TEXT NOT NULL DEFAULT 'website', "attempts" INTEGER NOT NULL DEFAULT 0,
  "checkpoint" JSONB NOT NULL DEFAULT '{}', "result" JSONB NOT NULL DEFAULT '{}', "errors" JSONB NOT NULL DEFAULT '[]',
  "leaseToken" TEXT, "leaseExpiresAt" TIMESTAMP(3), "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusinessAnalysisRun_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "BusinessAnalysisRun_status_leaseExpiresAt_idx" ON "BusinessAnalysisRun"("status", "leaseExpiresAt");
CREATE INDEX "BusinessAnalysisRun_clientId_startedAt_idx" ON "BusinessAnalysisRun"("clientId", "startedAt");
CREATE UNIQUE INDEX "BusinessAnalysisRun_one_active_client" ON "BusinessAnalysisRun"("clientId") WHERE "status" IN ('QUEUED', 'RUNNING');
ALTER TABLE "BlogPublication" ADD COLUMN "analysisRunId" TEXT, ADD COLUMN "requiresApproval" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "approvedAt" TIMESTAMP(3), ADD COLUMN "targetKeyword" TEXT NOT NULL DEFAULT '', ADD COLUMN "plannedTitle" TEXT NOT NULL DEFAULT '';
CREATE INDEX "BlogPublication_analysisRunId_idx" ON "BlogPublication"("analysisRunId");
ALTER TABLE "BlogPublication" ADD CONSTRAINT "BlogPublication_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "BusinessAnalysisRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessCompetitor" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessAnalysisRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "BusinessProfile", "BusinessCompetitor", "BusinessAnalysisRun" FROM anon, authenticated;
REVOKE ALL ON TABLE "BusinessProfile", "BusinessCompetitor", "BusinessAnalysisRun" FROM PUBLIC;
GRANT ALL ON TABLE "BusinessProfile", "BusinessCompetitor", "BusinessAnalysisRun" TO service_role;
