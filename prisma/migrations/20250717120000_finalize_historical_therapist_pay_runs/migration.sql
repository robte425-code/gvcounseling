-- Mark historical therapist pay runs as Paid (FINALIZED).
-- "Pending" is draft pay-run status after remittance apply; older batches were
-- never finalized in the portal. Scope: draft runs on applied remittances where
-- every invoice on the run has latest service date on or before 2026-07-02.
-- Does not send therapist emails (data correction only).

UPDATE "TherapistPayRun" AS pr
SET
  status = 'FINALIZED',
  "finalizedAt" = COALESCE(pr."finalizedAt", CURRENT_TIMESTAMP)
FROM "RemittanceAdvice" AS ra
WHERE pr."remittanceAdviceId" = ra.id
  AND ra.status = 'APPLIED'
  AND pr.status = 'DRAFT'
  AND EXISTS (
    SELECT 1
    FROM "TherapistPayRunPayout" p
    JOIN "TherapistPayRunLine" l ON l."payoutId" = p.id
    WHERE p."payRunId" = pr.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "TherapistPayRunPayout" p
    JOIN "TherapistPayRunLine" l ON l."payoutId" = p.id
    JOIN "InvoiceLineItem" ili ON ili."invoiceId" = l."invoiceId"
    WHERE p."payRunId" = pr.id
      -- Include all of calendar 2026-07-02 regardless of stored time-of-day.
      AND ili."serviceDate" >= TIMESTAMP '2026-07-03 00:00:00'
  );
