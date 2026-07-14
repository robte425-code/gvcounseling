-- Audit log for each 837 file generated from the billing portal.
CREATE TABLE "Edi837Submission" (
    "id" TEXT NOT NULL,
    "payPeriodId" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "isaUsageIndicator" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "isaControl" TEXT NOT NULL,
    "gsControl" TEXT NOT NULL,
    "claimCount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "contentSha256" TEXT NOT NULL,
    "invoiceSnapshot" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Edi837Submission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Edi837Submission_payPeriodId_generatedAt_idx" ON "Edi837Submission"("payPeriodId", "generatedAt");
CREATE INDEX "Edi837Submission_generatedAt_idx" ON "Edi837Submission"("generatedAt");

ALTER TABLE "Edi837Submission" ADD CONSTRAINT "Edi837Submission_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Edi837Submission" ADD CONSTRAINT "Edi837Submission_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
