CREATE TABLE "PlatformAdminProfile" (
  "id" TEXT NOT NULL,
  "authUserId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformAdminProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportSession" (
  "id" TEXT NOT NULL,
  "platformAdminId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "exchangedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "userAgent" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminAuditEvent" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "clientId" TEXT,
  "supportSessionId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "userAgent" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdminProfile_authUserId_key" ON "PlatformAdminProfile"("authUserId");
CREATE INDEX "PlatformAdminProfile_active_idx" ON "PlatformAdminProfile"("active");
CREATE UNIQUE INDEX "SupportSession_tokenHash_key" ON "SupportSession"("tokenHash");
CREATE INDEX "SupportSession_platformAdminId_createdAt_idx" ON "SupportSession"("platformAdminId", "createdAt");
CREATE INDEX "SupportSession_clientId_expiresAt_idx" ON "SupportSession"("clientId", "expiresAt");
CREATE INDEX "SupportSession_revokedAt_idx" ON "SupportSession"("revokedAt");
CREATE INDEX "AdminAuditEvent_actorId_createdAt_idx" ON "AdminAuditEvent"("actorId", "createdAt");
CREATE INDEX "AdminAuditEvent_clientId_createdAt_idx" ON "AdminAuditEvent"("clientId", "createdAt");
CREATE INDEX "AdminAuditEvent_supportSessionId_idx" ON "AdminAuditEvent"("supportSessionId");

ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_platformAdminId_fkey"
  FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdminProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupportSession" ADD CONSTRAINT "SupportSession_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "PlatformAdminProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminAuditEvent" ADD CONSTRAINT "AdminAuditEvent_supportSessionId_fkey"
  FOREIGN KEY ("supportSessionId") REFERENCES "SupportSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlatformAdminProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupportSession" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminAuditEvent" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "PlatformAdminProfile" FROM anon, authenticated;
REVOKE ALL ON TABLE "SupportSession" FROM anon, authenticated;
REVOKE ALL ON TABLE "AdminAuditEvent" FROM anon, authenticated;
