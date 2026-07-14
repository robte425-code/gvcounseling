-- Allow the same L&I payment to be imported as both PDF RA and 835 ERA for cross-verification.
CREATE TYPE "RemittanceSourceFormat" AS ENUM ('PDF_RA', 'ERA_835');

ALTER TABLE "RemittanceAdvice"
ADD COLUMN "sourceFormat" "RemittanceSourceFormat" NOT NULL DEFAULT 'PDF_RA';

DROP INDEX "RemittanceAdvice_remittanceNumber_warrantRegister_key";

CREATE UNIQUE INDEX "RemittanceAdvice_remittanceNumber_warrantRegister_sourceFormat_key"
ON "RemittanceAdvice"("remittanceNumber", "warrantRegister", "sourceFormat");
