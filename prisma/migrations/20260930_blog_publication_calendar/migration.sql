CREATE TYPE "BlogPublicationStatus" AS ENUM ('PLANNED', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'SKIPPED');

CREATE TABLE "BlogPublication" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "landingId" TEXT,
  "scheduledDate" DATE NOT NULL,
  "status" "BlogPublicationStatus" NOT NULL DEFAULT 'PLANNED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "needsDeploy" BOOLEAN NOT NULL DEFAULT false,
  "revisionAttempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT NOT NULL DEFAULT '',
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogPublication_landingId_key" ON "BlogPublication"("landingId");
CREATE UNIQUE INDEX "BlogPublication_clientId_scheduledDate_key" ON "BlogPublication"("clientId", "scheduledDate");
CREATE INDEX "BlogPublication_clientId_status_scheduledDate_idx" ON "BlogPublication"("clientId", "status", "scheduledDate");

ALTER TABLE "BlogPublication"
  ADD CONSTRAINT "BlogPublication_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BlogPublication_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BlogPublication" ENABLE ROW LEVEL SECURITY;
