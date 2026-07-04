-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'UNPAID', 'DENIED', 'APPEAL_IN_PROGRESS');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paymentStatus" "PaymentStatus",
ADD COLUMN "lniPaidAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Invoice_paymentStatus_idx" ON "Invoice"("paymentStatus");

-- Backfill billed invoices as unpaid until LNI payment is recorded
UPDATE "Invoice" SET "paymentStatus" = 'UNPAID' WHERE "status" = 'BILLED' AND "paymentStatus" IS NULL;
