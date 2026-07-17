-- Reportes internos capturados desde el usuario global `default`.
CREATE TYPE "IssueReportStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TABLE "IssueReport" (
    "id" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "originPath" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "reportedBy" TEXT NOT NULL DEFAULT 'default',
    "status" "IssueReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssueReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IssueReport_status_idx" ON "IssueReport"("status");
CREATE INDEX "IssueReport_createdAt_idx" ON "IssueReport"("createdAt");
