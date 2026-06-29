-- CreateTable
CREATE TABLE "ProcedureCodeFee" (
    "id" TEXT NOT NULL,
    "procedureCode" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "ProcedureCodeFee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcedureCodeFee_procedureCode_effectiveFrom_idx" ON "ProcedureCodeFee"("procedureCode", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ProcedureCodeFee_procedureCode_effectiveFrom_key" ON "ProcedureCodeFee"("procedureCode", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "ProcedureCodeFee" ADD CONSTRAINT "ProcedureCodeFee_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
