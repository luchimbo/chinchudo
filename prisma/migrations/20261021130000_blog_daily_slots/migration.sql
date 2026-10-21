ALTER TABLE "BlogPublication" ADD COLUMN "dailySlot" INTEGER NOT NULL DEFAULT 0;
DROP INDEX "BlogPublication_clientId_scheduledDate_key";
CREATE UNIQUE INDEX "BlogPublication_clientId_scheduledDate_dailySlot_key" ON "BlogPublication"("clientId", "scheduledDate", "dailySlot");
