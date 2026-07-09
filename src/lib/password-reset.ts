import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createTherapistPasswordResetToken(userId: string): Promise<string> {
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt },
    }),
  ]);

  return token;
}

export async function consumeTherapistPasswordResetToken(token: string): Promise<string | null> {
  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, role: true, active: true } } },
  });

  if (!row || row.expiresAt < new Date()) {
    if (row) {
      await prisma.passwordResetToken.delete({ where: { id: row.id } });
    }
    return null;
  }

  if (row.user.role !== "THERAPIST" || !row.user.active) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } });
    return null;
  }

  await prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } });
  return row.userId;
}
