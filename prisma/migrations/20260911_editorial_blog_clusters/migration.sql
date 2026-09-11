-- Editorial blog clusters and controllable internal linking.
CREATE TYPE "LandingContentType" AS ENUM ('LEGACY', 'PILLAR', 'GUIDE', 'CAMPAIGN');
CREATE TYPE "LandingIndexingState" AS ENUM ('INDEX', 'NOINDEX');
CREATE TYPE "LandingInternalLinkMode" AS ENUM ('AUTO', 'PINNED', 'EXCLUDED');

ALTER TABLE "Landing"
  ADD COLUMN "contentType" "LandingContentType" NOT NULL DEFAULT 'GUIDE',
  ADD COLUMN "indexingState" "LandingIndexingState" NOT NULL DEFAULT 'INDEX',
  ADD COLUMN "contentClusterId" TEXT,
  ADD COLUMN "authorName" TEXT NOT NULL DEFAULT 'Equipo PC MIDI Center',
  ADD COLUMN "sourceRefs" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "ContentCluster" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "pillarLandingId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentCluster_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LandingInternalLink" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sourceLandingId" TEXT NOT NULL,
  "targetLandingId" TEXT NOT NULL,
  "anchorText" TEXT NOT NULL DEFAULT '',
  "position" INTEGER NOT NULL DEFAULT 0,
  "mode" "LandingInternalLinkMode" NOT NULL DEFAULT 'AUTO',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LandingInternalLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContentCluster_clientId_slug_key" ON "ContentCluster"("clientId", "slug");
CREATE UNIQUE INDEX "ContentCluster_pillarLandingId_key" ON "ContentCluster"("pillarLandingId");
CREATE INDEX "ContentCluster_clientId_idx" ON "ContentCluster"("clientId");
CREATE UNIQUE INDEX "LandingInternalLink_sourceLandingId_targetLandingId_key" ON "LandingInternalLink"("sourceLandingId", "targetLandingId");
CREATE INDEX "LandingInternalLink_clientId_sourceLandingId_idx" ON "LandingInternalLink"("clientId", "sourceLandingId");
CREATE INDEX "LandingInternalLink_clientId_targetLandingId_idx" ON "LandingInternalLink"("clientId", "targetLandingId");
CREATE INDEX "Landing_clientId_indexingState_status_idx" ON "Landing"("clientId", "indexingState", "status");
CREATE INDEX "Landing_contentClusterId_idx" ON "Landing"("contentClusterId");

ALTER TABLE "ContentCluster"
  ADD CONSTRAINT "ContentCluster_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ContentCluster_pillarLandingId_fkey" FOREIGN KEY ("pillarLandingId") REFERENCES "Landing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Landing"
  ADD CONSTRAINT "Landing_contentClusterId_fkey" FOREIGN KEY ("contentClusterId") REFERENCES "ContentCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LandingInternalLink"
  ADD CONSTRAINT "LandingInternalLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LandingInternalLink_sourceLandingId_fkey" FOREIGN KEY ("sourceLandingId") REFERENCES "Landing"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "LandingInternalLink_targetLandingId_fkey" FOREIGN KEY ("targetLandingId") REFERENCES "Landing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The existing PC MIDI archive remains reachable but is deliberately excluded
-- from future XML sitemaps and search results while the editorial graph starts.
UPDATE "Landing" AS l
SET "contentType" = 'LEGACY', "indexingState" = 'NOINDEX'
FROM "Client" AS c
WHERE c."id" = l."clientId" AND c."slug" = 'pcmidi';

INSERT INTO "ContentCluster" ("id", "clientId", "slug", "name", "description", "updatedAt")
SELECT
  'editorial-' || c."id" || '-' || v.slug,
  c."id",
  v.slug,
  v.name,
  v.description,
  CURRENT_TIMESTAMP
FROM "Client" c
CROSS JOIN (VALUES
  ('controladores-midi', 'Controladores MIDI y DAW', 'Cómo elegir teclados, pads y controladores para cada software y flujo de trabajo.'),
  ('grabacion-en-casa', 'Grabación en casa', 'Interfaces, micrófonos y decisiones prácticas para grabar mejor en un home studio.'),
  ('podcast-y-streaming', 'Podcast y streaming', 'Guías para voces, transmisión en vivo y creación de contenido.'),
  ('monitoreo-home-studio', 'Monitoreo para home studio', 'Auriculares y monitores para escuchar, practicar y producir con criterio.'),
  ('sintetizadores', 'Sintetizadores', 'Síntesis, teclados y herramientas para crear sonidos y producir música electrónica.'),
  ('instrumentos-para-practicar', 'Instrumentos para practicar', 'Pianos digitales y baterías electrónicas para estudiar y tocar en casa.')
) AS v(slug, name, description)
WHERE c."slug" = 'pcmidi'
ON CONFLICT ("clientId", "slug") DO NOTHING;
