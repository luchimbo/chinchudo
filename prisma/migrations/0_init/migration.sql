-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'NEEDS_REVIEW', 'DRAFTED', 'APPROVED', 'PUBLISHED', 'DISCARDED', 'FOLLOW_UP', 'CONVERTED');

-- CreateEnum
CREATE TYPE "OpportunityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "OpportunityIntent" AS ENUM ('PURCHASE_QUESTION', 'TECHNICAL_QUESTION', 'PRICE_QUESTION', 'WARRANTY_QUESTION', 'COMPARISON', 'COMPLAINT', 'COMPETITOR_MENTION', 'GENERAL_DISCUSSION');

-- CreateEnum
CREATE TYPE "ResponseVariantType" AS ENUM ('SHORT', 'TECHNICAL', 'CONVERSATIONAL');

-- CreateEnum
CREATE TYPE "LandingStatus" AS ENUM ('DRAFT', 'APPROVED', 'PREVIEW_ONLINE', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeadMagnetType" AS ENUM ('CHECKLIST', 'GUIA', 'COMPARATIVA', 'PLANTILLA', 'PRESET');

-- CreateEnum
CREATE TYPE "NurtureStepStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DistributionChannel" AS ENUM ('REDDIT', 'LINKEDIN', 'TWITTER', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'NEWSLETTER', 'FORUM');

-- CreateEnum
CREATE TYPE "DistributionStatus" AS ENUM ('NEW', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "AIPresenceSourceType" AS ENUM ('DIRECT_AI_QUERY', 'SOCIAL_COMMENT', 'SOCIAL_VIDEO', 'SOCIAL_POST');

-- CreateEnum
CREATE TYPE "AIPresenceIntent" AS ENUM ('PURCHASE_QUESTION', 'TECHNICAL_QUESTION', 'PRICE_QUESTION', 'WARRANTY_QUESTION', 'COMPARISON', 'COMPETITOR_MENTION', 'BRAND_MENTION', 'RECOMMENDATION', 'GENERAL_DISCUSSION');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "domainKeywords" TEXT NOT NULL DEFAULT '[]',
    "domainExclusions" TEXT NOT NULL DEFAULT '[]',
    "dailyOpportunityTarget" INTEGER NOT NULL DEFAULT 15,
    "opportunitySearchState" JSONB NOT NULL DEFAULT '{}',
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "openrouterApiKey" TEXT NOT NULL DEFAULT '',
    "openrouterModel" TEXT NOT NULL DEFAULT '',
    "storeUrl" TEXT NOT NULL DEFAULT '',
    "blogBaseUrl" TEXT NOT NULL DEFAULT '',
    "labName" TEXT NOT NULL DEFAULT '',
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "landingTemplate" TEXT NOT NULL DEFAULT '',
    "landingPrimaryColor" TEXT NOT NULL DEFAULT '',
    "landingSecondaryColor" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "smtpHost" TEXT NOT NULL DEFAULT '',
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpUser" TEXT NOT NULL DEFAULT '',
    "smtpPass" TEXT NOT NULL DEFAULT '',
    "unsubscribeBaseUrl" TEXT NOT NULL DEFAULT '',
    "trackBaseUrl" TEXT NOT NULL DEFAULT '',
    "geoBrandPatterns" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandSnapshot" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "baselineAt" TIMESTAMP(3) NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "deltas" JSONB NOT NULL DEFAULT '{}',
    "csvPath" TEXT NOT NULL DEFAULT '',
    "pdfPath" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "clientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogRule" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaRule" (
    "id" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 3,
    "trigger" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "positioning" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "allowedClaims" TEXT NOT NULL DEFAULT '',
    "forbiddenClaims" TEXT NOT NULL DEFAULT '',
    "competitorWeaknesses" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "technicalSpecs" TEXT NOT NULL DEFAULT '',
    "useCases" TEXT NOT NULL DEFAULT '',
    "warrantyNotes" TEXT NOT NULL DEFAULT '',
    "stockStatus" TEXT NOT NULL DEFAULT 'Por confirmar',
    "priceRange" TEXT NOT NULL DEFAULT 'Por confirmar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Persona" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "tone" TEXT NOT NULL,
    "goals" TEXT NOT NULL,
    "preferredLength" TEXT NOT NULL,
    "allowedPhrases" TEXT NOT NULL DEFAULT '',
    "forbiddenPhrases" TEXT NOT NULL DEFAULT '',
    "goodExamples" TEXT NOT NULL DEFAULT '',
    "badExamples" TEXT NOT NULL DEFAULT '',
    "angle" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "voiceId" TEXT NOT NULL DEFAULT 'es-AR-TomasNeural',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Persona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "responseStyleNotes" TEXT NOT NULL,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceAuthor" TEXT NOT NULL DEFAULT '',
    "sourceText" TEXT NOT NULL,
    "signalType" TEXT NOT NULL DEFAULT 'actionable_question',
    "clientId" TEXT,
    "observedProfileId" TEXT,
    "detectedBrandId" TEXT,
    "detectedProductId" TEXT,
    "detectedIntent" "OpportunityIntent" NOT NULL DEFAULT 'GENERAL_DISCUSSION',
    "priority" "OpportunityPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "detectedTopics" JSONB NOT NULL DEFAULT '[]',
    "detectedTone" TEXT NOT NULL DEFAULT '',
    "detectedToneConfidence" TEXT NOT NULL DEFAULT 'low',
    "notes" TEXT NOT NULL DEFAULT '',
    "monitoredSourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservedProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalHandle" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "profileUrl" TEXT NOT NULL DEFAULT '',
    "toneSummary" TEXT NOT NULL DEFAULT '',
    "toneConfidence" TEXT NOT NULL DEFAULT 'low',
    "profileStatus" TEXT NOT NULL DEFAULT 'active',
    "primaryTopics" JSONB NOT NULL DEFAULT '[]',
    "secondaryTopics" JSONB NOT NULL DEFAULT '[]',
    "engagementPattern" JSONB NOT NULL DEFAULT '{}',
    "commercialReadiness" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservedProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservedInterest" (
    "id" TEXT NOT NULL,
    "observedProfileId" TEXT NOT NULL,
    "topicKey" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'low',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservedInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservedEvent" (
    "id" TEXT NOT NULL,
    "observedProfileId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "sourceTextSnapshot" TEXT NOT NULL,
    "primaryTopicKey" TEXT NOT NULL DEFAULT 'general',
    "secondaryTopicKeys" JSONB NOT NULL DEFAULT '[]',
    "topicConfidence" TEXT NOT NULL DEFAULT 'low',
    "toneSummary" TEXT NOT NULL DEFAULT '',
    "toneConfidence" TEXT NOT NULL DEFAULT 'low',
    "detectedIntent" "OpportunityIntent" NOT NULL DEFAULT 'GENERAL_DISCUSSION',
    "detectedPriority" "OpportunityPriority" NOT NULL DEFAULT 'MEDIUM',
    "signalSummary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObservedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Response" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "variantType" "ResponseVariantType" NOT NULL,
    "voiceVariant" TEXT NOT NULL DEFAULT '',
    "voiceVariantReason" TEXT NOT NULL DEFAULT '',
    "draftText" TEXT NOT NULL,
    "editedText" TEXT NOT NULL DEFAULT '',
    "riskNotes" TEXT NOT NULL DEFAULT '',
    "approvedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Response_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishingLog" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "publishedUrl" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedBy" TEXT NOT NULL DEFAULT 'Fede',
    "result" TEXT NOT NULL DEFAULT 'no_reply',
    "followUpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "account" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "PublishingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "brandId" TEXT,
    "productId" TEXT,
    "topic" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objection" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "brandId" TEXT,
    "productId" TEXT,
    "objection" TEXT NOT NULL,
    "recommendedAnswer" TEXT NOT NULL,
    "personaNotes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoredSource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "label" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "account" TEXT NOT NULL DEFAULT '',
    "limit" INTEGER NOT NULL DEFAULT 5,
    "targetUrl" TEXT NOT NULL DEFAULT '',
    "sourceKind" TEXT NOT NULL DEFAULT 'query',
    "lifecycle" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "expectedTopics" JSONB NOT NULL DEFAULT '[]',
    "emptyReads" INTEGER NOT NULL DEFAULT 0,
    "lastEvidenceAt" TIMESTAMP(3),
    "blockedReason" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "lastCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoredSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromptVersion" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userPromptTemplate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadMagnet" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "tipo" "LeadMagnetType" NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadMagnet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Landing" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "slug" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT '',
    "titulo" TEXT NOT NULL DEFAULT '',
    "htmlContent" TEXT NOT NULL,
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "seoDescription" TEXT NOT NULL DEFAULT '',
    "status" "LandingStatus" NOT NULL DEFAULT 'DRAFT',
    "publicPreviewUrl" TEXT NOT NULL DEFAULT '',
    "previewPublishedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "opportunityId" TEXT,
    "leadMagnetId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Landing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "email" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL,
    "keyword" TEXT NOT NULL DEFAULT '',
    "leadMagnetId" TEXT,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "landingId" TEXT,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NurtureStep" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "leadId" TEXT NOT NULL,
    "stepDay" INTEGER NOT NULL,
    "subject" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "status" "NurtureStepStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NurtureStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionPiece" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "canal" "DistributionChannel" NOT NULL,
    "contenido" TEXT NOT NULL,
    "status" "DistributionStatus" NOT NULL DEFAULT 'NEW',
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedUrl" TEXT,
    "landingId" TEXT,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPresenceResult" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "sourceType" "AIPresenceSourceType" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT '',
    "query" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "videoUrl" TEXT NOT NULL DEFAULT '',
    "videoTitle" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "context" TEXT NOT NULL DEFAULT '',
    "aiResponse" TEXT NOT NULL DEFAULT '',
    "relevanceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "brandDetected" TEXT NOT NULL DEFAULT '',
    "intent" "AIPresenceIntent" NOT NULL DEFAULT 'GENERAL_DISCUSSION',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "aiReasoning" TEXT NOT NULL DEFAULT '',
    "modelUsed" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIPresenceResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeoAudit" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "prompt" TEXT NOT NULL,
    "modeloIA" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "competidores" JSONB NOT NULL DEFAULT '[]',
    "gapsSugeridos" JSONB NOT NULL DEFAULT '[]',
    "respuestaCompleta" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeoAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "eventType" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "referrer" TEXT NOT NULL DEFAULT '',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "landingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingCategory" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LandingProduct" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "categoryKey" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL DEFAULT '',
    "useText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LandingProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedTopic" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "intent" TEXT NOT NULL DEFAULT '',
    "suggestedCategories" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trend" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL,
    "queryUsed" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoScript" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "trendId" TEXT,
    "brandId" TEXT,
    "productId" TEXT,
    "personaId" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "visualCues" TEXT NOT NULL DEFAULT '',
    "audioPrompt" TEXT NOT NULL DEFAULT '',
    "avatarVideoUrl" TEXT NOT NULL DEFAULT '',
    "avatarJobId" TEXT NOT NULL DEFAULT '',
    "avatarStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoScript_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Client_slug_key" ON "Client"("slug");

-- CreateIndex
CREATE INDEX "BrandSnapshot_clientId_scheduledFor_idx" ON "BrandSnapshot"("clientId", "scheduledFor");

-- CreateIndex
CREATE INDEX "BrandSnapshot_capturedAt_idx" ON "BrandSnapshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrandSnapshot_clientId_milestone_key" ON "BrandSnapshot"("clientId", "milestone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_clientId_idx" ON "User"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogRule_clientId_category_key" ON "CatalogRule"("clientId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_clientId_name_key" ON "Brand"("clientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_brandId_name_key" ON "Product"("brandId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Persona_clientId_name_key" ON "Persona"("clientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_name_key" ON "Channel"("name");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Opportunity_priority_idx" ON "Opportunity"("priority");

-- CreateIndex
CREATE INDEX "Opportunity_createdAt_idx" ON "Opportunity"("createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_channelId_idx" ON "Opportunity"("channelId");

-- CreateIndex
CREATE INDEX "Opportunity_clientId_idx" ON "Opportunity"("clientId");

-- CreateIndex
CREATE INDEX "Opportunity_observedProfileId_idx" ON "Opportunity"("observedProfileId");

-- CreateIndex
CREATE INDEX "Opportunity_detectedBrandId_idx" ON "Opportunity"("detectedBrandId");

-- CreateIndex
CREATE INDEX "Opportunity_detectedProductId_idx" ON "Opportunity"("detectedProductId");

-- CreateIndex
CREATE INDEX "Opportunity_monitoredSourceId_idx" ON "Opportunity"("monitoredSourceId");

-- CreateIndex
CREATE INDEX "ObservedProfile_clientId_idx" ON "ObservedProfile"("clientId");

-- CreateIndex
CREATE INDEX "ObservedProfile_platform_idx" ON "ObservedProfile"("platform");

-- CreateIndex
CREATE INDEX "ObservedProfile_lastSeenAt_idx" ON "ObservedProfile"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ObservedProfile_clientId_platform_externalHandle_key" ON "ObservedProfile"("clientId", "platform", "externalHandle");

-- CreateIndex
CREATE INDEX "ObservedInterest_observedProfileId_idx" ON "ObservedInterest"("observedProfileId");

-- CreateIndex
CREATE INDEX "ObservedInterest_topicKey_idx" ON "ObservedInterest"("topicKey");

-- CreateIndex
CREATE UNIQUE INDEX "ObservedInterest_observedProfileId_topicKey_key" ON "ObservedInterest"("observedProfileId", "topicKey");

-- CreateIndex
CREATE UNIQUE INDEX "ObservedEvent_opportunityId_key" ON "ObservedEvent"("opportunityId");

-- CreateIndex
CREATE INDEX "ObservedEvent_observedProfileId_idx" ON "ObservedEvent"("observedProfileId");

-- CreateIndex
CREATE INDEX "ObservedEvent_primaryTopicKey_idx" ON "ObservedEvent"("primaryTopicKey");

-- CreateIndex
CREATE INDEX "ObservedEvent_createdAt_idx" ON "ObservedEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Response_opportunityId_idx" ON "Response"("opportunityId");

-- CreateIndex
CREATE INDEX "Response_personaId_idx" ON "Response"("personaId");

-- CreateIndex
CREATE INDEX "Response_brandId_idx" ON "Response"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishingLog_responseId_key" ON "PublishingLog"("responseId");

-- CreateIndex
CREATE INDEX "PublishingLog_opportunityId_idx" ON "PublishingLog"("opportunityId");

-- CreateIndex
CREATE UNIQUE INDEX "MonitoredSource_label_key" ON "MonitoredSource"("label");

-- CreateIndex
CREATE UNIQUE INDEX "PromptVersion_name_version_key" ON "PromptVersion"("name", "version");

-- CreateIndex
CREATE INDEX "SystemLog_level_idx" ON "SystemLog"("level");

-- CreateIndex
CREATE INDEX "SystemLog_event_idx" ON "SystemLog"("event");

-- CreateIndex
CREATE INDEX "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadMagnet_slug_key" ON "LeadMagnet"("slug");

-- CreateIndex
CREATE INDEX "LeadMagnet_clientId_idx" ON "LeadMagnet"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Landing_slug_key" ON "Landing"("slug");

-- CreateIndex
CREATE INDEX "Landing_clientId_idx" ON "Landing"("clientId");

-- CreateIndex
CREATE INDEX "Landing_status_idx" ON "Landing"("status");

-- CreateIndex
CREATE INDEX "Landing_createdAt_idx" ON "Landing"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_clientId_idx" ON "Lead"("clientId");

-- CreateIndex
CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- CreateIndex
CREATE INDEX "Lead_slug_idx" ON "Lead"("slug");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "NurtureStep_clientId_idx" ON "NurtureStep"("clientId");

-- CreateIndex
CREATE INDEX "NurtureStep_status_idx" ON "NurtureStep"("status");

-- CreateIndex
CREATE INDEX "NurtureStep_scheduledAt_idx" ON "NurtureStep"("scheduledAt");

-- CreateIndex
CREATE INDEX "DistributionPiece_clientId_idx" ON "DistributionPiece"("clientId");

-- CreateIndex
CREATE INDEX "DistributionPiece_status_idx" ON "DistributionPiece"("status");

-- CreateIndex
CREATE INDEX "DistributionPiece_canal_idx" ON "DistributionPiece"("canal");

-- CreateIndex
CREATE INDEX "DistributionPiece_scheduledAt_idx" ON "DistributionPiece"("scheduledAt");

-- CreateIndex
CREATE INDEX "AIPresenceResult_clientId_idx" ON "AIPresenceResult"("clientId");

-- CreateIndex
CREATE INDEX "AIPresenceResult_createdAt_idx" ON "AIPresenceResult"("createdAt");

-- CreateIndex
CREATE INDEX "AIPresenceResult_relevanceScore_idx" ON "AIPresenceResult"("relevanceScore");

-- CreateIndex
CREATE INDEX "AIPresenceResult_sourceType_idx" ON "AIPresenceResult"("sourceType");

-- CreateIndex
CREATE INDEX "AIPresenceResult_channel_idx" ON "AIPresenceResult"("channel");

-- CreateIndex
CREATE INDEX "AIPresenceResult_intent_idx" ON "AIPresenceResult"("intent");

-- CreateIndex
CREATE INDEX "GeoAudit_clientId_idx" ON "GeoAudit"("clientId");

-- CreateIndex
CREATE INDEX "GeoAudit_createdAt_idx" ON "GeoAudit"("createdAt");

-- CreateIndex
CREATE INDEX "GeoAudit_score_idx" ON "GeoAudit"("score");

-- CreateIndex
CREATE INDEX "TrackingEvent_clientId_idx" ON "TrackingEvent"("clientId");

-- CreateIndex
CREATE INDEX "TrackingEvent_slug_idx" ON "TrackingEvent"("slug");

-- CreateIndex
CREATE INDEX "TrackingEvent_eventType_idx" ON "TrackingEvent"("eventType");

-- CreateIndex
CREATE INDEX "TrackingEvent_createdAt_idx" ON "TrackingEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LandingCategory_clientId_idx" ON "LandingCategory"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "LandingCategory_clientId_key_key" ON "LandingCategory"("clientId", "key");

-- CreateIndex
CREATE INDEX "LandingProduct_clientId_idx" ON "LandingProduct"("clientId");

-- CreateIndex
CREATE INDEX "LandingProduct_categoryKey_idx" ON "LandingProduct"("categoryKey");

-- CreateIndex
CREATE UNIQUE INDEX "LandingProduct_clientId_externalId_key" ON "LandingProduct"("clientId", "externalId");

-- CreateIndex
CREATE INDEX "SeedTopic_clientId_idx" ON "SeedTopic"("clientId");

-- CreateIndex
CREATE INDEX "SeedTopic_keyword_idx" ON "SeedTopic"("keyword");

-- CreateIndex
CREATE INDEX "Trend_clientId_idx" ON "Trend"("clientId");

-- CreateIndex
CREATE INDEX "Trend_createdAt_idx" ON "Trend"("createdAt");

-- CreateIndex
CREATE INDEX "VideoScript_clientId_idx" ON "VideoScript"("clientId");

-- CreateIndex
CREATE INDEX "VideoScript_status_idx" ON "VideoScript"("status");

-- CreateIndex
CREATE INDEX "VideoScript_createdAt_idx" ON "VideoScript"("createdAt");

-- AddForeignKey
ALTER TABLE "BrandSnapshot" ADD CONSTRAINT "BrandSnapshot_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogRule" ADD CONSTRAINT "CatalogRule_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaRule" ADD CONSTRAINT "PersonaRule_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Persona" ADD CONSTRAINT "Persona_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_observedProfileId_fkey" FOREIGN KEY ("observedProfileId") REFERENCES "ObservedProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_detectedBrandId_fkey" FOREIGN KEY ("detectedBrandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_detectedProductId_fkey" FOREIGN KEY ("detectedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_monitoredSourceId_fkey" FOREIGN KEY ("monitoredSourceId") REFERENCES "MonitoredSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservedProfile" ADD CONSTRAINT "ObservedProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservedInterest" ADD CONSTRAINT "ObservedInterest_observedProfileId_fkey" FOREIGN KEY ("observedProfileId") REFERENCES "ObservedProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservedEvent" ADD CONSTRAINT "ObservedEvent_observedProfileId_fkey" FOREIGN KEY ("observedProfileId") REFERENCES "ObservedProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservedEvent" ADD CONSTRAINT "ObservedEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingLog" ADD CONSTRAINT "PublishingLog_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishingLog" ADD CONSTRAINT "PublishingLog_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "Response"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoredSource" ADD CONSTRAINT "MonitoredSource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMagnet" ADD CONSTRAINT "LeadMagnet_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Landing" ADD CONSTRAINT "Landing_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Landing" ADD CONSTRAINT "Landing_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Landing" ADD CONSTRAINT "Landing_leadMagnetId_fkey" FOREIGN KEY ("leadMagnetId") REFERENCES "LeadMagnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_leadMagnetId_fkey" FOREIGN KEY ("leadMagnetId") REFERENCES "LeadMagnet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurtureStep" ADD CONSTRAINT "NurtureStep_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NurtureStep" ADD CONSTRAINT "NurtureStep_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionPiece" ADD CONSTRAINT "DistributionPiece_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionPiece" ADD CONSTRAINT "DistributionPiece_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributionPiece" ADD CONSTRAINT "DistributionPiece_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPresenceResult" ADD CONSTRAINT "AIPresenceResult_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeoAudit" ADD CONSTRAINT "GeoAudit_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingEvent" ADD CONSTRAINT "TrackingEvent_landingId_fkey" FOREIGN KEY ("landingId") REFERENCES "Landing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingCategory" ADD CONSTRAINT "LandingCategory_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LandingProduct" ADD CONSTRAINT "LandingProduct_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeedTopic" ADD CONSTRAINT "SeedTopic_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trend" ADD CONSTRAINT "Trend_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoScript" ADD CONSTRAINT "VideoScript_trendId_fkey" FOREIGN KEY ("trendId") REFERENCES "Trend"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoScript" ADD CONSTRAINT "VideoScript_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoScript" ADD CONSTRAINT "VideoScript_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoScript" ADD CONSTRAINT "VideoScript_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "Persona"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoScript" ADD CONSTRAINT "VideoScript_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

