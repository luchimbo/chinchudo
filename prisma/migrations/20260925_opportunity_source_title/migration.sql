-- Guarda el título de la fuente por separado para distinguir título y descripción de videos.
ALTER TABLE "Opportunity" ADD COLUMN "sourceTitle" TEXT NOT NULL DEFAULT '';
