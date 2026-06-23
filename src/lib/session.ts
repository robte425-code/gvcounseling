import type { Session } from "next-auth";
import { Role } from "@/generated/prisma/client";

export function getRealUserId(session: Session): string {
  return session.user.realUserId ?? session.user.id;
}

export function getRealRole(session: Session): Role {
  return session.user.realRole ?? session.user.role;
}

export function isImpersonating(session: Session): boolean {
  return session.user.isImpersonating === true;
}

export function portalHomePath(session: Session): string {
  if (isImpersonating(session) || session.user.role === "THERAPIST") {
    return "/portal/therapist/dashboard";
  }
  return "/portal/admin/dashboard";
}
