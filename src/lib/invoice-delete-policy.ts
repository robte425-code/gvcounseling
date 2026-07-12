type InvoiceDeleteSnapshot = {
  status: "DRAFT" | "SUBMITTED" | "BILLED";
  billedAt?: Date | string | null;
  payPeriodId?: string | null;
  remittanceLineCount?: number;
  payRunLineCount?: number;
};

/** Whether admin UI should offer delete for this invoice. */
export function canDeleteAdminInvoice(invoice: Pick<InvoiceDeleteSnapshot, "status" | "billedAt">): boolean {
  return invoice.status === "DRAFT" && !invoice.billedAt;
}

/** Server-side guard with relation checks before hard delete. */
export function assertAdminCanDeleteInvoice(invoice: InvoiceDeleteSnapshot): void {
  if (!canDeleteAdminInvoice(invoice)) {
    throw new Error("Only draft invoices can be deleted.");
  }
  if (invoice.payPeriodId) {
    throw new Error("Cannot delete an invoice assigned to a pay period.");
  }
  if ((invoice.remittanceLineCount ?? 0) > 0) {
    throw new Error("Cannot delete an invoice linked to remittance advice.");
  }
  if ((invoice.payRunLineCount ?? 0) > 0) {
    throw new Error("Cannot delete an invoice included in a therapist pay run.");
  }
}
