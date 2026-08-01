-- `isPrimary` puede existir en bases que recibieron el cambio previo por db push.
ALTER TABLE "Response" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Response_isPrimary_idx" ON "Response"("isPrimary");

-- Un mismo refinamiento puede pasar por aprobar y publicar. Esta restricción
-- hace que ambos caminos no dupliquen el aprendizaje automático asociado.
CREATE UNIQUE INDEX IF NOT EXISTS "ClientMemory_responseId_source_key"
  ON "ClientMemory"("responseId", "source");
