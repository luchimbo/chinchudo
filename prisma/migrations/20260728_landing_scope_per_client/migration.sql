-- A landing belongs to exactly one client. Slugs are only unique within that client.
-- Existing rows are already assigned (verified before this migration).
ALTER TABLE "Landing" DROP CONSTRAINT "Landing_clientId_fkey";
ALTER TABLE "Landing" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Landing" ADD CONSTRAINT "Landing_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Landing_slug_key";
CREATE UNIQUE INDEX "Landing_clientId_slug_key" ON "Landing"("clientId", "slug");
