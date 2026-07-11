import {
  sendAdminPendingReferralAgingEmail,
  sendTherapistPendingReferralAgingEmail,
  type PendingReferralItem,
} from "@/lib/portal-workflow-emails";
import { prisma } from "@/lib/prisma";

export const PENDING_REFERRAL_AGE_HOURS = 48;

export async function sendPendingReferralAgingReminders(options?: {
  ageHours?: number;
  now?: Date;
}): Promise<{ adminCount: number; therapistCount: number; referralCount: number }> {
  const ageHours = options?.ageHours ?? PENDING_REFERRAL_AGE_HOURS;
  const now = options?.now ?? new Date();
  const cutoff = new Date(now.getTime() - ageHours * 60 * 60 * 1000);

  const pending = await prisma.client.findMany({
    where: {
      assignmentStatus: "PENDING_THERAPIST",
      therapistId: { not: null },
      updatedAt: { lte: cutoff },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      lniClaimNumber: true,
      updatedAt: true,
      therapist: {
        select: { id: true, email: true, firstName: true, lastName: true, active: true },
      },
    },
    orderBy: { updatedAt: "asc" },
  });

  const referrals: Array<
    PendingReferralItem & {
      therapistId: string;
      therapistEmail: string;
    }
  > = [];

  for (const client of pending) {
    if (!client.therapist?.active) continue;
    referrals.push({
      clientId: client.id,
      clientName: `${client.lastName}, ${client.firstName}`,
      claimNumber: client.lniClaimNumber,
      therapistName: `${client.therapist.firstName} ${client.therapist.lastName}`.trim(),
      pendingSince: client.updatedAt,
      therapistId: client.therapist.id,
      therapistEmail: client.therapist.email,
    });
  }

  if (referrals.length === 0) {
    return { adminCount: 0, therapistCount: 0, referralCount: 0 };
  }

  await sendAdminPendingReferralAgingEmail({
    referrals: referrals.map(
      ({ therapistId: _id, therapistEmail: _email, ...rest }) => rest,
    ),
    ageHours,
  });

  const byTherapist = new Map<
    string,
    { email: string; name: string; referrals: PendingReferralItem[] }
  >();

  for (const referral of referrals) {
    const item: PendingReferralItem = {
      clientId: referral.clientId,
      clientName: referral.clientName,
      claimNumber: referral.claimNumber,
      therapistName: referral.therapistName,
      pendingSince: referral.pendingSince,
    };
    const existing = byTherapist.get(referral.therapistId);
    if (existing) {
      existing.referrals.push(item);
    } else {
      byTherapist.set(referral.therapistId, {
        email: referral.therapistEmail,
        name: referral.therapistName,
        referrals: [item],
      });
    }
  }

  for (const therapist of byTherapist.values()) {
    await sendTherapistPendingReferralAgingEmail({
      therapistEmail: therapist.email,
      therapistName: therapist.name,
      referrals: therapist.referrals,
      ageHours,
    });
  }

  return {
    adminCount: 1,
    therapistCount: byTherapist.size,
    referralCount: referrals.length,
  };
}
