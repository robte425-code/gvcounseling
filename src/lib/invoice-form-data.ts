import type { InvoiceLineItem } from "@/components/portal/InvoiceEditor";

export function buildInvoiceFormData(
  lines: InvoiceLineItem[],
  options: { invoiceId?: string; clientId?: string },
): FormData {
  const formData = new FormData();
  if (options.invoiceId) formData.set("invoiceId", options.invoiceId);
  if (options.clientId) formData.set("clientId", options.clientId);
  formData.set("lineCount", String(lines.length));
  lines.forEach((line, index) => {
    formData.set(`line_${index}_serviceDate`, line.serviceDate);
    formData.set(`line_${index}_procedureCode`, line.procedureCode);
  });
  return formData;
}

export function linesArePersistable(lines: InvoiceLineItem[]): boolean {
  return (
    lines.length > 0 &&
    lines.every(
      (line) =>
        /^\d{4}-\d{2}-\d{2}$/.test(line.serviceDate) &&
        line.procedureCode.trim() !== "" &&
        (!line.amount || parseFloat(line.amount) > 0),
    )
  );
}
