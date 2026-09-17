-- Un chat de refinamiento puede dejar varios aprendizajes para la misma respuesta.
DROP INDEX IF EXISTS "ClientMemory_responseId_source_key";

CREATE INDEX "ClientMemory_responseId_source_idx" ON "ClientMemory"("responseId", "source");
