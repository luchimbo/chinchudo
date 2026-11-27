-- DropForeignKey
ALTER TABLE "BrandSnapshot" DROP CONSTRAINT "BrandSnapshot_clientId_fkey";

-- DropForeignKey
ALTER TABLE "InstagramConnection" DROP CONSTRAINT "InstagramConnection_clientId_fkey";

-- DropForeignKey
ALTER TABLE "ReferenceAccount" DROP CONSTRAINT "ReferenceAccount_clientId_fkey";

-- DropForeignKey
ALTER TABLE "PieceMetricSnapshot" DROP CONSTRAINT "PieceMetricSnapshot_contentIdeaId_fkey";

-- DropForeignKey
ALTER TABLE "LeadMagnet" DROP CONSTRAINT "LeadMagnet_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Landing" DROP CONSTRAINT "Landing_leadMagnetId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_landingId_fkey";

-- DropForeignKey
ALTER TABLE "Lead" DROP CONSTRAINT "Lead_leadMagnetId_fkey";

-- DropForeignKey
ALTER TABLE "NurtureStep" DROP CONSTRAINT "NurtureStep_clientId_fkey";

-- DropForeignKey
ALTER TABLE "NurtureStep" DROP CONSTRAINT "NurtureStep_leadId_fkey";

-- DropForeignKey
ALTER TABLE "DistributionPiece" DROP CONSTRAINT "DistributionPiece_clientId_fkey";

-- DropForeignKey
ALTER TABLE "DistributionPiece" DROP CONSTRAINT "DistributionPiece_landingId_fkey";

-- DropForeignKey
ALTER TABLE "DistributionPiece" DROP CONSTRAINT "DistributionPiece_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "AIPresenceResult" DROP CONSTRAINT "AIPresenceResult_clientId_fkey";

-- DropForeignKey
ALTER TABLE "GeoAudit" DROP CONSTRAINT "GeoAudit_clientId_fkey";

-- DropForeignKey
ALTER TABLE "Trend" DROP CONSTRAINT "Trend_clientId_fkey";

-- DropForeignKey
ALTER TABLE "VideoScript" DROP CONSTRAINT "VideoScript_trendId_fkey";

-- DropForeignKey
ALTER TABLE "VideoScript" DROP CONSTRAINT "VideoScript_brandId_fkey";

-- DropForeignKey
ALTER TABLE "VideoScript" DROP CONSTRAINT "VideoScript_productId_fkey";

-- DropForeignKey
ALTER TABLE "VideoScript" DROP CONSTRAINT "VideoScript_personaId_fkey";

-- DropForeignKey
ALTER TABLE "VideoScript" DROP CONSTRAINT "VideoScript_clientId_fkey";

-- DropForeignKey
ALTER TABLE "VideoScript" DROP CONSTRAINT "VideoScript_contentIdeaId_fkey";

-- DropForeignKey
ALTER TABLE "ContentIdea" DROP CONSTRAINT "ContentIdea_clientId_fkey";

-- DropForeignKey
ALTER TABLE "ContentIdea" DROP CONSTRAINT "ContentIdea_productId_fkey";

-- DropForeignKey
ALTER TABLE "ContentIdea" DROP CONSTRAINT "ContentIdea_trendId_fkey";

-- AlterTable
ALTER TABLE "Landing" DROP COLUMN "leadMagnetId";

-- DropTable
DROP TABLE "BrandSnapshot";

-- DropTable
DROP TABLE "InstagramConnection";

-- DropTable
DROP TABLE "ReferenceAccount";

-- DropTable
DROP TABLE "PieceMetricSnapshot";

-- DropTable
DROP TABLE "LeadMagnet";

-- DropTable
DROP TABLE "Lead";

-- DropTable
DROP TABLE "NurtureStep";

-- DropTable
DROP TABLE "DistributionPiece";

-- DropTable
DROP TABLE "AIPresenceResult";

-- DropTable
DROP TABLE "GeoAudit";

-- DropTable
DROP TABLE "Trend";

-- DropTable
DROP TABLE "VideoScript";

-- DropTable
DROP TABLE "ContentIdea";

-- DropEnum
DROP TYPE "LeadMagnetType";

-- DropEnum
DROP TYPE "NurtureStepStatus";

-- DropEnum
DROP TYPE "DistributionChannel";

-- DropEnum
DROP TYPE "DistributionStatus";

-- DropEnum
DROP TYPE "AIPresenceSourceType";

-- DropEnum
DROP TYPE "AIPresenceIntent";

-- DropEnum
DROP TYPE "ContentIntent";

-- DropEnum
DROP TYPE "ContentIdeaStatus";

