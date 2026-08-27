CREATE TABLE "YouTubeConnection" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "channelId" TEXT NOT NULL DEFAULT '',
  "channelTitle" TEXT NOT NULL DEFAULT '',
  "scopes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "YouTubeConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "YouTubeConnection_clientId_account_key" ON "YouTubeConnection"("clientId", "account");
CREATE INDEX "YouTubeConnection_clientId_idx" ON "YouTubeConnection"("clientId");

ALTER TABLE "YouTubeConnection" ADD CONSTRAINT "YouTubeConnection_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PublishingLog" ADD COLUMN "publishMethod" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "PublishingLog" ADD COLUMN "remoteId" TEXT NOT NULL DEFAULT '';

-- Prisma is the only database client for these application-only credentials.
ALTER TABLE "YouTubeConnection" ENABLE ROW LEVEL SECURITY;
