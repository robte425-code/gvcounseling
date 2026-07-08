import {
  getRealRole,
  getRealUserId,
  isImpersonating,
  requireSession,
} from "@/auth";
import { prisma } from "@/lib/prisma";

type AuthSession = Awaited<ReturnType<typeof requireSession>>;

export async function assertClientNoteAccess(clientId: string, session: AuthSession) {
  const isAdmin = getRealRole(session) === "ADMIN" && !isImpersonating(session);

  if (isAdmin) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found.");
    return;
  }

  if (session.user.role === "THERAPIST") {
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: session.user.id },
      select: { id: true },
    });
    if (!client) throw new Error("Client not found.");
    return;
  }

  throw new Error("Forbidden.");
}

export async function assertCanModifyClientNote(noteId: string, session: AuthSession) {
  const note = await prisma.clientNote.findUnique({
    where: { id: noteId },
    select: { id: true, clientId: true, authorId: true },
  });
  if (!note) throw new Error("Note not found.");

  await assertClientNoteAccess(note.clientId, session);

  const isAdmin = getRealRole(session) === "ADMIN" && !isImpersonating(session);
  if (isAdmin || note.authorId === getRealUserId(session)) {
    return note;
  }

  throw new Error("You can only edit or delete your own notes.");
}

export type ClientNoteListItem = {
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

export async function loadClientNotes(clientId: string): Promise<ClientNoteListItem[]> {
  const session = await requireSession();
  await assertClientNoteAccess(clientId, session);

  const userId = getRealUserId(session);
  const isAdmin = getRealRole(session) === "ADMIN" && !isImpersonating(session);

  const notes = await prisma.clientNote.findMany({
    where: { clientId },
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

export function formatClientNoteAuthorName(author: {
  firstName: string;
  lastName: string;
  role: "ADMIN" | "THERAPIST";
}): string {
  const name = `${author.firstName} ${author.lastName}`;
  return author.role === "ADMIN" ? `${name} (Admin)` : name;
}

export function formatClientNoteTimestamp(createdAt: Date): string {
  return createdAt.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function wasClientNoteEdited(createdAt: Date, updatedAt: Date): boolean {
  return updatedAt.getTime() - createdAt.getTime() > 1000;
}

export function formatVrcAcceptanceNote(options: {
  acceptedAt: Date;
  adminName: string;
  to: string;
  redirected: boolean;
  intendedVrcEmail: string;
}): string {
  const when = formatClientNoteTimestamp(options.acceptedAt);
  const emailLine = options.redirected
    ? `VRC acceptance email sent to admins (${options.to}) for preview; intended VRC: ${options.intendedVrcEmail}.`
    : `VRC acceptance email sent to ${options.to}.`;

  return `Referral accepted by ${options.adminName} (admin) on ${when}.\n\n${emailLine}`;
}
