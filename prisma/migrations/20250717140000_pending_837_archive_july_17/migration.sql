-- One-shot: regenerate July 17 2026 837 (including billed invoices) and archive to Drive "837 Files"
-- on the next production build via scripts/run-pending-837-archive.ts.

INSERT INTO "PortalSetting" ("key", "value", "updatedAt")
VALUES ('pending_837_archive_cutoff', '2026-07-17', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "updatedAt" = CURRENT_TIMESTAMP;
