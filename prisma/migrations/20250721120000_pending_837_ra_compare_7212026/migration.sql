-- One-shot: compare archived July 17 production 837(s) against the 7/21/2026 RA.
INSERT INTO "PortalSetting" ("key", "value", "updatedAt")
VALUES ('pending_837_ra_compare', '2026-07-21', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updatedAt" = CURRENT_TIMESTAMP;
