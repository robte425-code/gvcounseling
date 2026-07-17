export type InvoiceAttachmentView = {
  id: string;
  filename: string;
  blobUrl: string;
};

export function mergeUniqueAttachments(
  ...lists: InvoiceAttachmentView[][]
): InvoiceAttachmentView[] {
  const byId = new Map<string, InvoiceAttachmentView>();
  for (const list of lists) {
    for (const item of list) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values());
}

/** Plain props for Client Components (avoid passing Prisma Date fields through). */
export function toInvoiceAttachmentViews(
  attachments: Array<{ id: string; filename: string; blobUrl: string }>,
): InvoiceAttachmentView[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    blobUrl: attachment.blobUrl,
  }));
}
