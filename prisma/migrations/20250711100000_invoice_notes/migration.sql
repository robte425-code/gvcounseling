-- CreateTable
CREATE TABLE "InvoiceNote" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceNote_invoiceId_createdAt_idx" ON "InvoiceNote"("invoiceId", "createdAt");

-- AddForeignKey
ALTER TABLE "InvoiceNote" ADD CONSTRAINT "InvoiceNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceNote" ADD CONSTRAINT "InvoiceNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
