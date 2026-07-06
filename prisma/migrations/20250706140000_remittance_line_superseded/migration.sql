-- AlterTable
ALTER TABLE "RemittanceAdviceLine" ADD COLUMN "supersededAt" TIMESTAMP(3);
ALTER TABLE "RemittanceAdviceLine" ADD COLUMN "supersedeNote" TEXT;
