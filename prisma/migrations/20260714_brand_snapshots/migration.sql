CREATE TABLE "BrandSnapshot" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "baselineAt" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "deltas" JSONB NOT NULL DEFAULT '{}',
    "csvPath" TEXT NOT NULL DEFAULT '',
    "pdfPath" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrandSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandSnapshot_clientId_milestone_key" ON "BrandSnapshot"("clientId", "milestone");
CREATE INDEX "BrandSnapshot_clientId_scheduledFor_idx" ON "BrandSnapshot"("clientId", "scheduledFor");
CREATE INDEX "BrandSnapshot_capturedAt_idx" ON "BrandSnapshot"("capturedAt");
ALTER TABLE "BrandSnapshot" ADD CONSTRAINT "BrandSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
