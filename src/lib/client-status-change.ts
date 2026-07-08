import { prisma } from "@/lib/prisma";
import { sendAdminTherapistClientStatusEmail } from "@/lib/referral-emails";
import { getAdminNotificationEmails } from "@/lib/portal-settings";

export type ClientStatusChangeAction = "closed" | "reopened" | "rejected";

const actionNoteTitles: Record<ClientStatusChangeAction, string> = {
  closed: "Client closed",
  reopened: "Client reopened",
  rejected: "Referral rejected",
};

export function formatClientStatusChangeNote(
  action: ClientStatusChangeAction,
  actorName: string,
  actorRole: "ADMIN" | "THERAPIST",
  reason: string,
): string {
  const roleLabel = actorRole === "ADMIN" ? "admin" : "therapist";
  return `${actionNoteTitles[action]} by ${actorName} (${roleLabel}).\n\nReason:\n${reason}`;
}

export async function recordClientStatusChange(options: {
  clientId: string;
  authorId: string;
  action: ClientStatusChangeAction;
  actorName: string;
  actorRole: "ADMIN" | "THERAPIST";
  reason: string;
  clientName: string;
  claimNumber: string;
  notifyAdmins?: boolean;
}): Promise<void> {
  await prisma.clientNote.create({
    data: {
      clientId: options.clientId,
      authorId: options.authorId,
      body: formatClientStatusChangeNote(
        options.action,
        options.actorName,
        options.actorRole,
        options.reason,
      ),
    },
  });

  if (options.notifyAdmins && options.actorRole === "THERAPIST") {
    const adminEmails = await getAdminNotificationEmails();
    await sendAdminTherapistClientStatusEmail({
      adminEmails,
      therapistName: options.actorName,
      action: options.action,
      clientName: options.clientName,
      claimNumber: options.claimNumber,
      reason: options.reason,
      clientId: options.clientId,
    });
  }
}
