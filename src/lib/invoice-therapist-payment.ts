/** Whether the therapist has been paid for this invoice (included in an applied remittance pay run). */
export function isTherapistPaidForInvoice(payRunLineCount: number): boolean {
  return payRunLineCount > 0;
}

export function therapistPaymentLabel(paid: boolean): string {
  return paid ? "Paid" : "Unpaid";
}
