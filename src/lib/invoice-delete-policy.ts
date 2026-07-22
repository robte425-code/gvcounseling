type InvoiceDeleteSnapshot = {
  status: "DRAFT" | "SUBMITTED" | "BILLED";
  billedAt?: Date | string | null;
  payPeriodId?: string | null;
  remittanceLineCount?: number;
  payRunLineCount?: number;
};

/** Whether admin UI should offer delete for this invoice. */
export function canDeleteAdminInvoice(
  invoice: Pick<InvoiceDeleteSnapshot, "payPeriodId">,
): boolean {
  return invoice.payPeriodId == null;
}

/** Server-side guard with relation checks before hard delete. */
export function assertAdminCanDeleteInvoice(invoice: InvoiceDeleteSnapshot): void {
  if (!canDeleteAdminInvoice(invoice)) {
    throw new Error("Only unassigned invoices (no pay period) can be deleted.");
  }
  if ((invoice.remittanceLineCount ?? 0) > 0) {
    throw new Error("Cannot delete an invoice linked to remittance advice.");
  }
  if ((invoice.payRunLineCount ?? 0) > 0) {
    throw new Error("Cannot delete an invoice included in a therapist pay run.");
  }
}
