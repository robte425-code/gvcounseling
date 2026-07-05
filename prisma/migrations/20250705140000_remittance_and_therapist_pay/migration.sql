-- CreateEnum
CREATE TYPE "RemittanceBillSection" AS ENUM ('PAID', 'DENIED', 'IN_PROCESS');

-- CreateEnum
CREATE TYPE "TherapistPayRunStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "RemittanceAdviceStatus" AS ENUM ('PREVIEW', 'APPLIED');

-- CreateTable
CREATE TABLE "RemittanceAdvice" (
    "id" TEXT NOT NULL,
    "remittanceNumber" TEXT NOT NULL,
    "warrantRegister" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "reportDate" TIMESTAMP(3),
    "payeeNumber" TEXT NOT NULL,
    "payeeName" TEXT NOT NULL,
    "totalPaid" DECIMAL(10,2) NOT NULL,
    "status" "RemittanceAdviceStatus" NOT NULL DEFAULT 'PREVIEW',
    "appliedAt" TIMESTAMP(3),
    "sourceFilename" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedById" TEXT NOT NULL,

    CONSTRAINT "RemittanceAdvice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemittanceAdviceLine" (
    "id" TEXT NOT NULL,
    "remittanceAdviceId" TEXT NOT NULL,
    "section" "RemittanceBillSection" NOT NULL,
    "claimNumber" TEXT NOT NULL,
    "icn" TEXT NOT NULL,
    "patientName" TEXT,
    "serviceProviderId" TEXT NOT NULL,
    "serviceProviderNpi" TEXT,
    "serviceProviderName" TEXT,
    "billTotalPayable" DECIMAL(10,2) NOT NULL,
    "eobCodes" TEXT[],
    "serviceLines" JSONB NOT NULL,
    "matchedInvoiceId" TEXT,
    "matchNote" TEXT,

    CONSTRAINT "RemittanceAdviceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistPayRun" (
    "id" TEXT NOT NULL,
    "remittanceAdviceId" TEXT NOT NULL,
    "status" "TherapistPayRunStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistPayRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistPayRunPayout" (
    "id" TEXT NOT NULL,
    "payRunId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "therapistAmount" DECIMAL(10,2) NOT NULL,
    "lniPaidAmount" DECIMAL(10,2) NOT NULL,
    "invoiceCount" INTEGER NOT NULL,

    CONSTRAINT "TherapistPayRunPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistPayRunLine" (
    "id" TEXT NOT NULL,
    "payoutId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "lniPaidAmount" DECIMAL(10,2) NOT NULL,
    "therapistAmount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "TherapistPayRunLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RemittanceAdvice_remittanceNumber_warrantRegister_key" ON "RemittanceAdvice"("remittanceNumber", "warrantRegister");

-- CreateIndex
CREATE INDEX "RemittanceAdvice_invoiceDate_idx" ON "RemittanceAdvice"("invoiceDate");

-- CreateIndex
CREATE INDEX "RemittanceAdviceLine_remittanceAdviceId_idx" ON "RemittanceAdviceLine"("remittanceAdviceId");

-- CreateIndex
CREATE INDEX "RemittanceAdviceLine_claimNumber_idx" ON "RemittanceAdviceLine"("claimNumber");

-- CreateIndex
CREATE INDEX "RemittanceAdviceLine_matchedInvoiceId_idx" ON "RemittanceAdviceLine"("matchedInvoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistPayRun_remittanceAdviceId_key" ON "TherapistPayRun"("remittanceAdviceId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistPayRunPayout_payRunId_therapistId_key" ON "TherapistPayRunPayout"("payRunId", "therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "TherapistPayRunLine_payoutId_invoiceId_key" ON "TherapistPayRunLine"("payoutId", "invoiceId");

-- AddForeignKey
ALTER TABLE "RemittanceAdvice" ADD CONSTRAINT "RemittanceAdvice_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceAdviceLine" ADD CONSTRAINT "RemittanceAdviceLine_remittanceAdviceId_fkey" FOREIGN KEY ("remittanceAdviceId") REFERENCES "RemittanceAdvice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemittanceAdviceLine" ADD CONSTRAINT "RemittanceAdviceLine_matchedInvoiceId_fkey" FOREIGN KEY ("matchedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistPayRun" ADD CONSTRAINT "TherapistPayRun_remittanceAdviceId_fkey" FOREIGN KEY ("remittanceAdviceId") REFERENCES "RemittanceAdvice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistPayRunPayout" ADD CONSTRAINT "TherapistPayRunPayout_payRunId_fkey" FOREIGN KEY ("payRunId") REFERENCES "TherapistPayRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistPayRunPayout" ADD CONSTRAINT "TherapistPayRunPayout_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistPayRunLine" ADD CONSTRAINT "TherapistPayRunLine_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "TherapistPayRunPayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistPayRunLine" ADD CONSTRAINT "TherapistPayRunLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
