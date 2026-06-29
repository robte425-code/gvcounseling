-- CreateTable
CREATE TABLE "TherapistProcedureCodeFee" (
    "id" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "procedureCode" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "TherapistProcedureCodeFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TPCF_therapist_code_from_idx" ON "TherapistProcedureCodeFee"("therapistId", "procedureCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "TPCF_therapist_code_from_key" ON "TherapistProcedureCodeFee"("therapistId", "procedureCode", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "TherapistProcedureCodeFee" ADD CONSTRAINT "TherapistProcedureCodeFee_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistProcedureCodeFee" ADD CONSTRAINT "TherapistProcedureCodeFee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
