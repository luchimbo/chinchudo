-- Respuestas aceptadas como correctas desde el chat del Copiloto: se usan como ejemplos al generar.
ALTER TABLE "Response" ADD COLUMN "acceptedAsCorrectAt" TIMESTAMP(3);

CREATE INDEX "Response_acceptedAsCorrectAt_idx" ON "Response"("acceptedAsCorrectAt");
