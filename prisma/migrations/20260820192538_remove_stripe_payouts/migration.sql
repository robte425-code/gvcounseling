-- Stripe was never used to actually pay a therapist (zero transfers on record) — removing
-- the integration entirely in favor of manual BECU wire transfers.
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeConnectAccountId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "stripeConnectReady";

ALTER TABLE "TherapistPayRun" DROP COLUMN IF EXISTS "stripePaidAt";

ALTER TABLE "TherapistPayRunPayout" DROP COLUMN IF EXISTS "stripeTransferId";
ALTER TABLE "TherapistPayRunPayout" DROP COLUMN IF EXISTS "stripeTransferStatus";
ALTER TABLE "TherapistPayRunPayout" DROP COLUMN IF EXISTS "stripePaidAt";
