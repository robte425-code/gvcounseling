import {
  getRealRole,
  getRealUserId,
  isImpersonating,
  requireSession,
} from "@/auth";
import {
  formatClientNoteAuthorName,
  formatClientNoteTimestamp,
  wasClientNoteEdited,
} from "@/lib/client-notes";
import { prisma } from "@/lib/prisma";

type AuthSession = Awaited<ReturnType<typeof requireSession>>;

export async function assertInvoiceNoteAccess(invoiceId: string, session: AuthSession) {
  const isAdmin = getRealRole(session) === "ADMIN" && !isImpersonating(session);

  if (isAdmin) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true },
    });
    if (!invoice) throw new Error("Invoice not found.");
    return;
  }

  if (session.user.role === "THERAPIST") {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, therapistId: session.user.id },
      select: { id: true },
    });
    if (!invoice) throw new Error("Invoice not found.");
    return;
  }

  throw new Error("Forbidden.");
}

export async function assertCanModifyInvoiceNote(noteId: string, session: AuthSession) {
  const note = await prisma.invoiceNote.findUnique({
    where: { id: noteId },
    select: { id: true, invoiceId: true, authorId: true },
  });
  if (!note) throw new Error("Note not found.");

  await assertInvoiceNoteAccess(note.invoiceId, session);

  const isAdmin = getRealRole(session) === "ADMIN" && !isImpersonating(session);
  if (isAdmin || note.authorId === getRealUserId(session)) {
    return note;
  }

  throw new Error("You can only edit or delete your own notes.");
}

export type InvoiceNoteListItem = {
  id: string;
  body: string;
  createdAt: Date;
  updatedAt: Date;
  author: {
    firstName: string;
    lastName: string;
    role: "ADMIN" | "THERAPIST";
  };
  canModify: boolean;
};

export async function loadInvoiceNotes(invoiceId: string): Promise<InvoiceNoteListItem[]> {
  const session = await requireSession();
  await assertInvoiceNoteAccess(invoiceId, session);

  const userId = getRealUserId(session);
  const isAdmin = getRealRole(session) === "ADMIN" && !isImpersonating(session);

  const notes = await prisma.invoiceNote.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "desc" },
    include: {
      author: { select: { firstName: true, lastName: true, role: true } },
    },
  });

  return notes.map((note) => ({
    id: note.id,
    body: note.body,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    author: note.author,
    canModify: isAdmin || note.authorId === userId,
  }));
}

export const formatInvoiceNoteAuthorName = formatClientNoteAuthorName;
export const formatInvoiceNoteTimestamp = formatClientNoteTimestamp;
export const wasInvoiceNoteEdited = wasClientNoteEdited;
