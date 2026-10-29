-- CreateEnum
CREATE TYPE "ContactMethod" AS ENUM ('EMAIL', 'PHONE', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "Readiness" AS ENUM ('EXPLORING', 'WITHIN_SIX_MONTHS', 'READY_NOW');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "consultationConsentAt" TIMESTAMP(3),
ADD COLUMN     "enquiryIntent" TEXT,
ADD COLUMN     "preferredContactMethod" "ContactMethod",
ADD COLUMN     "publicReference" TEXT,
ADD COLUMN     "readiness" "Readiness";

-- CreateTable
CREATE TABLE "UpdateSubscription" (
    "email" TEXT,
    "phone" TEXT,
    "id" TEXT NOT NULL,
    "name" TEXT,
    "consentWhatsapp" BOOLEAN NOT NULL DEFAULT false,
    "consentEmail" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "signupType" TEXT NOT NULL,
    "sourcePath" TEXT,
    "unsubscribeToken" TEXT NOT NULL,
    "unsubscribedAt" TIMESTAMP(3),
    "mailerliteSyncedAt" TIMESTAMP(3),
    "mailerliteError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpdateSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UpdateSubscription_email_key" ON "UpdateSubscription"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UpdateSubscription_phone_key" ON "UpdateSubscription"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "UpdateSubscription_unsubscribeToken_key" ON "UpdateSubscription"("unsubscribeToken");

-- CreateIndex
CREATE INDEX "UpdateSubscription_createdAt_idx" ON "UpdateSubscription"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_publicReference_key" ON "Client"("publicReference");

