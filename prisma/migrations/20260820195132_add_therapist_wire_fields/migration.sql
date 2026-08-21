-- Record the manual BECU wire per therapist payout, so the portal has proof of
-- payment (date + confirmation number) now that Stripe no longer supplies one.
ALTER TABLE "TherapistPayRunPayout" ADD COLUMN IF NOT EXISTS "wireSentAt" DATE;
ALTER TABLE "TherapistPayRunPayout" ADD COLUMN IF NOT EXISTS "wireReference" TEXT;
