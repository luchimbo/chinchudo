ALTER TABLE "LandingProduct"
  ADD COLUMN "tiendanubeId" TEXT,
  ADD COLUMN "sourceSnapshot" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "missingRuns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastMissingDate" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "linkStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "LandingCategory"
  ADD COLUMN "tiendanubeId" TEXT,
  ADD COLUMN "sourceSnapshot" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "lastSeenAt" TIMESTAMP(3),
  ADD COLUMN "missingRuns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastMissingDate" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "linkStatus" TEXT NOT NULL DEFAULT 'active';
CREATE UNIQUE INDEX "LandingProduct_clientId_tiendanubeId_key" ON "LandingProduct" ("clientId", "tiendanubeId");
CREATE UNIQUE INDEX "LandingCategory_clientId_tiendanubeId_key" ON "LandingCategory" ("clientId", "tiendanubeId");
CREATE TABLE "CatalogSyncRun" (
  "id" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL REFERENCES "Client" (id) ON DELETE CASCADE ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "checkpoint" JSONB NOT NULL DEFAULT '{}',
  "changes" JSONB NOT NULL DEFAULT '[]',
  "errors" JSONB NOT NULL DEFAULT '[]',
  "deployment" JSONB NOT NULL DEFAULT '{}',
  "deploymentAttempts" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "finishedAt" TIMESTAMP(3)
);
CREATE INDEX "CatalogSyncRun_clientId_startedAt_idx" ON "CatalogSyncRun" ("clientId", "startedAt");
CREATE INDEX "CatalogSyncRun_clientId_status_idx" ON "CatalogSyncRun" ("clientId", "status");
CREATE UNIQUE INDEX "CatalogSyncRun_one_active_client" ON "CatalogSyncRun" ("clientId")
  WHERE status IN ('QUEUED', 'RUNNING', 'PENDING_DEPLOY', 'DEPLOYING');
ALTER TABLE "CatalogSyncRun" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CatalogSyncRun" FROM anon, authenticated;
