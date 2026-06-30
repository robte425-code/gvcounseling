-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "payPeriodId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_payPeriodId_idx" ON "Invoice"("payPeriodId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_payPeriodId_fkey" FOREIGN KEY ("payPeriodId") REFERENCES "PayPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
