-- Preparado para aplicar cuando se habilite la persistencia del onboarding.
-- No ejecutar contra Supabase durante la revisión local de UI.

CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'ANALYZING', 'IN_REVIEW', 'COMPLETED');

ALTER TABLE "User" ADD COLUMN "authUserId" UUID;
CREATE UNIQUE INDEX "User_authUserId_key" ON "User"("authUserId");

CREATE TABLE "ClientOnboarding" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "currentStep" INTEGER NOT NULL DEFAULT 1,
  "sourceUrl" TEXT NOT NULL DEFAULT '',
  "businessType" TEXT NOT NULL DEFAULT '',
  "draft" JSONB NOT NULL DEFAULT '{}',
  "analysisError" TEXT NOT NULL DEFAULT '',
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClientOnboarding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientOnboarding_clientId_key" ON "ClientOnboarding"("clientId");
CREATE INDEX "ClientOnboarding_status_idx" ON "ClientOnboarding"("status");
ALTER TABLE "ClientOnboarding" ADD CONSTRAINT "ClientOnboarding_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La app accede a través de Prisma en el servidor; no exponer el borrador
-- de onboarding a Data API por defecto.
ALTER TABLE "ClientOnboarding" ENABLE ROW LEVEL SECURITY;
