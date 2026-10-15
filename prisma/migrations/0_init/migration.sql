-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ADVISOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('PROSPECT', 'ENGAGED', 'FUNDED', 'I526E_FILED', 'I526E_APPROVED', 'GREEN_CARD_CONDITIONAL', 'I829_FILED', 'I829_APPROVED', 'LOST');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('GOOGLE_ADS', 'REFERRAL', 'WEBSITE', 'EVENT', 'PARTNER', 'LINKEDIN', 'OTHER');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('CALL', 'ZOOM', 'IN_PERSON', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "CommissionTrigger" AS ENUM ('ON_FUNDING', 'ON_I526E_FILING', 'ON_I526E_APPROVAL', 'OTHER');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('NOT_DUE', 'DUE', 'INVOICED', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('I526E_RECEIPT', 'INVOICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ConversionType" AS ENUM ('LEAD', 'ENGAGED', 'FUNDED');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VIEWER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegionalCentre" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegionalCentre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "regionalCentreId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "secondaryEmail" TEXT,
    "phone" TEXT,
    "countryOfResidence" TEXT,
    "countryOfBirth" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'OTHER',
    "sourceRaw" TEXT,
    "referredById" TEXT,
    "referredByName" TEXT,
    "gclid" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "keyword" TEXT,
    "landingPage" TEXT,
    "leadDate" TIMESTAMP(3),
    "status" "ClientStatus" NOT NULL DEFAULT 'PROSPECT',
    "attorney" TEXT,
    "caseWorker" TEXT,
    "regionalCentreId" TEXT,
    "projectId" TEXT,
    "investmentAmountCents" INTEGER,
    "dateFunded" TIMESTAMP(3),
    "i526eFiledDate" TIMESTAMP(3),
    "i526eReceiptNumber" TEXT,
    "i526eApprovedDate" TIMESTAMP(3),
    "greenCardIssuedDate" TIMESTAMP(3),
    "i829FiledDate" TIMESTAMP(3),
    "i829ApprovedDate" TIMESTAMP(3),
    "nextAction" TEXT,
    "followUpDate" TIMESTAMP(3),
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "legacyContactType" TEXT,
    "legacyBusiness" TEXT,
    "legacyProgramme" TEXT,
    "legacyInvestorStatus" TEXT,
    "spouseOrParent" TEXT,
    "adminFeeCents" INTEGER,
    "pmFeeCents" INTEGER,
    "interestReceived" BOOLEAN,
    "interestRatePct" DOUBLE PRECISION,
    "interestToGalerie" BOOLEAN,
    "importBatch" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "type" "MeetingType" NOT NULL DEFAULT 'CALL',
    "attendees" TEXT,
    "summary" TEXT,
    "createdById" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "regionalCentreId" TEXT,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "trigger" "CommissionTrigger" NOT NULL DEFAULT 'ON_FUNDING',
    "status" "CommissionStatus" NOT NULL DEFAULT 'NOT_DUE',
    "invoiceNumber" TEXT,
    "invoiceSentDate" TIMESTAMP(3),
    "paymentDueDate" TIMESTAMP(3),
    "paymentReceivedDate" TIMESTAMP(3),
    "amountReceivedCents" INTEGER,
    "paidDateUnknown" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'OTHER',
    "filename" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "clientId" TEXT,
    "commissionId" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "summary" TEXT,
    "actorId" TEXT,
    "actorLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ConversionType" NOT NULL,
    "gclid" TEXT,
    "valueCents" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ConversionStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RegionalCentre_name_key" ON "RegionalCentre"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Project_name_key" ON "Project"("name");

-- CreateIndex
CREATE INDEX "Project_regionalCentreId_idx" ON "Project"("regionalCentreId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_reference_key" ON "Client"("reference");

-- CreateIndex
CREATE INDEX "Client_status_idx" ON "Client"("status");

-- CreateIndex
CREATE INDEX "Client_followUpDate_idx" ON "Client"("followUpDate");

-- CreateIndex
CREATE INDEX "Client_regionalCentreId_idx" ON "Client"("regionalCentreId");

-- CreateIndex
CREATE INDEX "Client_projectId_idx" ON "Client"("projectId");

-- CreateIndex
CREATE INDEX "Client_source_idx" ON "Client"("source");

-- CreateIndex
CREATE INDEX "Client_gclid_idx" ON "Client"("gclid");

-- CreateIndex
CREATE INDEX "Client_lastName_idx" ON "Client"("lastName");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_externalId_key" ON "Meeting"("externalId");

-- CreateIndex
CREATE INDEX "Meeting_clientId_occurredAt_idx" ON "Meeting"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Commission_clientId_idx" ON "Commission"("clientId");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "Commission_regionalCentreId_idx" ON "Commission"("regionalCentreId");

-- CreateIndex
CREATE INDEX "Commission_paymentDueDate_idx" ON "Commission"("paymentDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Document_storageKey_key" ON "Document"("storageKey");

-- CreateIndex
CREATE INDEX "Document_clientId_idx" ON "Document"("clientId");

-- CreateIndex
CREATE INDEX "Document_commissionId_idx" ON "Document"("commissionId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ConversionEvent_status_idx" ON "ConversionEvent"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionEvent_clientId_type_key" ON "ConversionEvent"("clientId", "type");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_regionalCentreId_fkey" FOREIGN KEY ("regionalCentreId") REFERENCES "RegionalCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_regionalCentreId_fkey" FOREIGN KEY ("regionalCentreId") REFERENCES "RegionalCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_regionalCentreId_fkey" FOREIGN KEY ("regionalCentreId") REFERENCES "RegionalCentre"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

