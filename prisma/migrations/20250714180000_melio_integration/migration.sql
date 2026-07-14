-- Melio vendor name for therapists (must match vendor name in Melio when importing bills)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "melioVendorName" TEXT;

-- Track when a pay run was exported / emailed to Melio
ALTER TABLE "TherapistPayRun" ADD COLUMN IF NOT EXISTS "melioExportedAt" TIMESTAMP(3);
