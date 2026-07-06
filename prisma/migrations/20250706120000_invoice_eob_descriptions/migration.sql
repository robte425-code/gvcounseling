-- Per-line and per-invoice L&I EOB code descriptions from remittance advice.
ALTER TABLE "RemittanceAdviceLine" ADD COLUMN "eobCodeDescriptions" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "Invoice" ADD COLUMN "lniEobCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Invoice" ADD COLUMN "lniEobCodeDescriptions" JSONB NOT NULL DEFAULT '{}';
