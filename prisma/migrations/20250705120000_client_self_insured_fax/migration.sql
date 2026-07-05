-- Self-insured employer fax copy fields
ALTER TABLE "Client" ADD COLUMN "selfInsured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "employerFax" TEXT;
