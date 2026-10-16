-- CreateTable
CREATE TABLE "InstagramConnection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "scopes" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferenceAccount" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMPETENCIA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "medianViews" INTEGER,
    "lastScannedAt" TIMESTAMP(3),
    "scanRequestedAt" TIMESTAMP(3),
    "lastError" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferenceAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PieceMetricSnapshot" (
    "id" TEXT NOT NULL,
    "contentIdeaId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "views" INTEGER,
    "reach" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "saves" INTEGER,
    "shares" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PieceMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramConnection_clientId_key" ON "InstagramConnection"("clientId");

-- CreateIndex
CREATE INDEX "ReferenceAccount_clientId_active_idx" ON "ReferenceAccount"("clientId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "ReferenceAccount_clientId_platform_handle_key" ON "ReferenceAccount"("clientId", "platform", "handle");

-- CreateIndex
CREATE INDEX "PieceMetricSnapshot_contentIdeaId_capturedAt_idx" ON "PieceMetricSnapshot"("contentIdeaId", "capturedAt");

-- AddForeignKey
ALTER TABLE "InstagramConnection" ADD CONSTRAINT "InstagramConnection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferenceAccount" ADD CONSTRAINT "ReferenceAccount_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PieceMetricSnapshot" ADD CONSTRAINT "PieceMetricSnapshot_contentIdeaId_fkey" FOREIGN KEY ("contentIdeaId") REFERENCES "ContentIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
