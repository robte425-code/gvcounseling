-- L&I MARFS procedure code fees (FY 2025 and FY 2026 effective dates)
INSERT INTO "ProcedureCodeFee" ("id", "procedureCode", "amount", "effectiveFrom", "effectiveTo", "createdAt")
VALUES
  (gen_random_uuid()::text, '96156', 182.57, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '96156', 192.09, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '96158', 125.41, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '96158', 131.49, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '96159', 43.16, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '96159', 45.16, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '90832', 145.83, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '90832', 153.22, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '90834', 192.49, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '90834', 202.95, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '90837', 284.65, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '90837', 297.86, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '9919M', 66.41, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '9919M', 68.89, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '9918M', 53.13, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '9918M', 55.11, '2026-07-01', NULL, NOW()),
  (gen_random_uuid()::text, '1073M', 60.41, '2025-07-01', '2026-06-30', NOW()),
  (gen_random_uuid()::text, '1073M', 62.67, '2026-07-01', NULL, NOW())
ON CONFLICT ("procedureCode", "effectiveFrom") DO UPDATE SET
  "amount" = EXCLUDED."amount",
  "effectiveTo" = EXCLUDED."effectiveTo";
