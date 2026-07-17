-- Persist Bill L&I Test/Production mode as Production, and queue a production
-- regenerate/archive of the 2026-07-17 837 on the next deploy.

INSERT INTO "PortalSetting" ("key", "value", "updatedAt")
VALUES ('billing_isa_usage_indicator', 'P', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "PortalSetting" ("key", "value", "updatedAt")
VALUES ('pending_837_archive_cutoff', '2026-07-17', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "PortalSetting" ("key", "value", "updatedAt")
VALUES ('pending_837_archive_usage', 'P', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE
SET "value" = EXCLUDED."value",
    "updatedAt" = CURRENT_TIMESTAMP;
