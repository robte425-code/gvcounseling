-- Drop Melio fields if a prior draft migration was applied locally
ALTER TABLE "User" DROP COLUMN IF EXISTS "melioVendorName";
ALTER TABLE "TherapistPayRun" DROP COLUMN IF EXISTS "melioExportedAt";

-- Stripe Connect fields for therapist ACH payouts
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeConnectAccountId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "stripeConnectReady" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "User_stripeConnectAccountId_key" ON "User"("stripeConnectAccountId");

ALTER TABLE "TherapistPayRun" ADD COLUMN IF NOT EXISTS "stripePaidAt" TIMESTAMP(3);

ALTER TABLE "TherapistPayRunPayout" ADD COLUMN IF NOT EXISTS "stripeTransferId" TEXT;
ALTER TABLE "TherapistPayRunPayout" ADD COLUMN IF NOT EXISTS "stripeTransferStatus" TEXT;
ALTER TABLE "TherapistPayRunPayout" ADD COLUMN IF NOT EXISTS "stripePaidAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "TherapistPayRunPayout_stripeTransferId_key" ON "TherapistPayRunPayout"("stripeTransferId");
