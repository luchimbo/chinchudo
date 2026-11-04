-- AlterTable
ALTER TABLE "Landing" ADD COLUMN     "language" TEXT,
ADD COLUMN     "translationOfId" TEXT;

-- CreateTable
CREATE TABLE "CMCoverageSnapshot" (
    "clientId" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "counts" JSONB NOT NULL DEFAULT '{}',
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CMCoverageSnapshot_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "CMManualJob" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "inputVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedBy" TEXT NOT NULL DEFAULT '',
    "leaseUntil" TIMESTAMP(3),
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" JSONB,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CMManualJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CMManualJob_status_availableAt_idx" ON "CMManualJob"("status", "availableAt");

-- CreateIndex
CREATE INDEX "CMManualJob_clientId_createdAt_idx" ON "CMManualJob"("clientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CMManualJob_clientId_idempotencyKey_key" ON "CMManualJob"("clientId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Landing_clientId_language_idx" ON "Landing"("clientId", "language");

-- CreateIndex
CREATE INDEX "Landing_clientId_translationOfId_idx" ON "Landing"("clientId", "translationOfId");


-- Enforce one active manual request per opportunity and one runner per tenant.
CREATE UNIQUE INDEX "CMManualJob_active_opportunity" ON "CMManualJob" ("opportunityId") WHERE status IN ('QUEUED', 'RUNNING');
CREATE UNIQUE INDEX "CMManualJob_running_client" ON "CMManualJob" ("clientId") WHERE status = 'RUNNING';
ALTER TABLE "CMManualJob" ADD CONSTRAINT "CMManualJob_status_check" CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CONFLICT'));
ALTER TABLE "CMManualJob" ADD CONSTRAINT "CMManualJob_opportunity_fk" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"(id) ON DELETE CASCADE;
ALTER TABLE "CMManualJob" ADD CONSTRAINT "CMManualJob_client_fk" FOREIGN KEY ("clientId") REFERENCES "Client"(id) ON DELETE CASCADE;
ALTER TABLE "CMCoverageSnapshot" ADD CONSTRAINT "CMCoverageSnapshot_client_fk" FOREIGN KEY ("clientId") REFERENCES "Client"(id) ON DELETE CASCADE;
ALTER TABLE "CMManualJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CMCoverageSnapshot" ENABLE ROW LEVEL SECURITY;

-- Derive indexed metadata for EVERY writer, including Python/raw SQL.
CREATE FUNCTION public.sync_blog_metadata() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE payload jsonb; parent_id text;
BEGIN
  BEGIN payload := NEW."htmlContent"::jsonb; EXCEPTION WHEN invalid_text_representation THEN payload := '{}'::jsonb; END;
  NEW.language := CASE WHEN payload->>'language' IN ('es','en','de') THEN payload->>'language' ELSE 'es' END;
  parent_id := nullif(payload->>'translation_of','');
  IF parent_id IS NOT NULL AND (parent_id = NEW.id OR NOT EXISTS (SELECT 1 FROM "Landing" WHERE id = parent_id AND "clientId" = NEW."clientId")) THEN
    RAISE EXCEPTION 'invalid_translation_parent';
  END IF;
  NEW."translationOfId" := parent_id;
  RETURN NEW;
END $$;
CREATE TRIGGER landing_metadata BEFORE INSERT OR UPDATE OF "htmlContent", "clientId", language, "translationOfId" ON "Landing" FOR EACH ROW EXECUTE FUNCTION public.sync_blog_metadata();

-- Dirty summaries synchronously, including changes made by Python and imports.
CREATE FUNCTION public.invalidate_cm_coverage() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  UPDATE "CMCoverageSnapshot" SET "invalidatedAt" = clock_timestamp();
  RETURN NULL;
END $$;
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Opportunity" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Response" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Client" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Brand" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Product" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Service" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Persona" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "PersonaRule" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "CatalogRule" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "KnowledgeBase" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Objection" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "ClientMemory" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "PromptVersion" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "Channel" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
CREATE TRIGGER cm_coverage_dirty AFTER INSERT OR UPDATE OR DELETE ON "PublishingLog" FOR EACH STATEMENT EXECUTE FUNCTION public.invalidate_cm_coverage();
REVOKE ALL ON FUNCTION public.sync_blog_metadata() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invalidate_cm_coverage() FROM PUBLIC;
