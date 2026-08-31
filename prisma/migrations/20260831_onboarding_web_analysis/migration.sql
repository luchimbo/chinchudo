ALTER TABLE "Product"
  ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "sourceExternalId" TEXT,
  ADD COLUMN "sourceUrl" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "sourceSnapshotAt" TIMESTAMP(3);

CREATE INDEX "Product_sourceExternalId_idx" ON "Product"("sourceExternalId");

CREATE TABLE "Service" (
  "id" TEXT NOT NULL,
  "brandId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "description" TEXT NOT NULL DEFAULT '',
  "scope" TEXT NOT NULL DEFAULT '',
  "modality" TEXT NOT NULL DEFAULT '',
  "audience" TEXT NOT NULL DEFAULT '',
  "priceRange" TEXT NOT NULL DEFAULT 'Por confirmar',
  "availabilityNotes" TEXT NOT NULL DEFAULT 'Por confirmar',
  "sourceType" TEXT NOT NULL DEFAULT 'manual',
  "sourceExternalId" TEXT,
  "sourceUrl" TEXT NOT NULL DEFAULT '',
  "sourceSnapshotAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Service_brandId_name_key" ON "Service"("brandId", "name");
CREATE INDEX "Service_brandId_idx" ON "Service"("brandId");
CREATE INDEX "Service_sourceExternalId_idx" ON "Service"("sourceExternalId");
ALTER TABLE "Service" ADD CONSTRAINT "Service_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "OnboardingSourcePage" (
  "id" TEXT NOT NULL,
  "onboardingId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "pageType" TEXT NOT NULL DEFAULT 'other',
  "contentHash" TEXT NOT NULL DEFAULT '',
  "excerpt" TEXT NOT NULL DEFAULT '',
  "extracted" JSONB NOT NULL DEFAULT '{}',
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OnboardingSourcePage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnboardingSourcePage_onboardingId_url_key" ON "OnboardingSourcePage"("onboardingId", "url");
CREATE INDEX "OnboardingSourcePage_onboardingId_idx" ON "OnboardingSourcePage"("onboardingId");
ALTER TABLE "OnboardingSourcePage" ADD CONSTRAINT "OnboardingSourcePage_onboardingId_fkey"
  FOREIGN KEY ("onboardingId") REFERENCES "ClientOnboarding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnboardingSourcePage" ENABLE ROW LEVEL SECURITY;
