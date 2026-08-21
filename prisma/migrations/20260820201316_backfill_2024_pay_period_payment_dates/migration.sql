-- Three 2024 pay periods (Mar 29, Apr 12, Apr 26) were imported without a
-- paymentDate. loadPaycheckSummaries only considers periods that have one, so
-- every therapist payout from those periods was silently dropped from the
-- Paychecks page -- $1,803.75 of Maria's finalized pay.
--
-- L&I pays 4 days after cutoff in 55 of 70 recorded periods (5 days in the rest),
-- and cutoff + 4 reproduces the actual payment date of each orphaned remittance
-- exactly: Mar 29 -> Apr 2 (RA 767130), Apr 12 -> Apr 16 (RA 771565),
-- Apr 26 -> Apr 30 (RA 776114).
--
-- Scoped to rows that are still NULL, so this is a one-time correction of the
-- imported backlog and cannot overwrite a real payment date.
UPDATE "PayPeriod"
SET "paymentDate" = "cutoffDate" + INTERVAL '4 days'
WHERE "paymentDate" IS NULL;
