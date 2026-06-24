-- CreateEnum
CREATE TYPE "ClientAssignmentStatus" AS ENUM ('UNASSIGNED', 'PENDING_THERAPIST', 'ACTIVE', 'REJECTED_BY_ADMIN');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "referralClientEmail" TEXT;
ALTER TABLE "Client" ADD COLUMN "pgapCoach" TEXT;
ALTER TABLE "Client" ADD COLUMN "languages" TEXT;
ALTER TABLE "Client" ADD COLUMN "priorServices" TEXT;
ALTER TABLE "Client" ADD COLUMN "clientHistory" TEXT;
ALTER TABLE "Client" ADD COLUMN "assignmentStatus" "ClientAssignmentStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Client" ADD COLUMN "driveFolderId" TEXT;
ALTER TABLE "Client" ADD COLUMN "rejectionReason" TEXT;
ALTER TABLE "Client" ADD COLUMN "rejectedAt" TIMESTAMP(3);
ALTER TABLE "Client" ALTER COLUMN "therapistId" DROP NOT NULL;

UPDATE "Client" SET "assignmentStatus" = 'ACTIVE' WHERE "therapistId" IS NOT NULL;
