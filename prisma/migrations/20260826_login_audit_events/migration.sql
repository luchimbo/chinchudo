CREATE TABLE "login_audit_events" (
  "id" TEXT NOT NULL,
  "clientId" TEXT,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "reason" TEXT,
  "ipAddress" TEXT NOT NULL DEFAULT '',
  "userAgent" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginAuditEvent_email_createdAt_idx" ON "login_audit_events"("email", "createdAt");
CREATE INDEX "LoginAuditEvent_clientId_createdAt_idx" ON "login_audit_events"("clientId", "createdAt");

ALTER TABLE "login_audit_events" ADD CONSTRAINT "login_audit_events_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
