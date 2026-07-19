-- AlterTable
ALTER TABLE "TherapistPayRunPayout" ADD COLUMN "computedTherapistAmount" DECIMAL(10,2),
ADD COLUMN "adjustmentNote" TEXT,
ADD COLUMN "adjustedAt" TIMESTAMP(3);

-- Backfill computed amount from current therapist amount
UPDATE "TherapistPayRunPayout" SET "computedTherapistAmount" = "therapistAmount" WHERE "computedTherapistAmount" IS NULL;

-- Make required after backfill
ALTER TABLE "TherapistPayRunPayout" ALTER COLUMN "computedTherapistAmount" SET NOT NULL;
