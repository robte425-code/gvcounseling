import type { ClientAssignmentStatus } from "@/generated/prisma/client";

const THERAPIST_CLOSABLE_STATUSES: ClientAssignmentStatus[] = [
  "ACTIVE",
  "PENDING_THERAPIST",
];

const ADMIN_CLOSABLE_STATUSES: ClientAssignmentStatus[] = [
  "ACTIVE",
  "PENDING_THERAPIST",
  "UNASSIGNED",
];

export function canTherapistCloseClient(status: ClientAssignmentStatus): boolean {
  return THERAPIST_CLOSABLE_STATUSES.includes(status);
}

export function canAdminCloseClient(status: ClientAssignmentStatus): boolean {
  return ADMIN_CLOSABLE_STATUSES.includes(status);
}

export function canCloseClient(
  status: ClientAssignmentStatus,
  role: "admin" | "therapist",
): boolean {
  return role === "admin" ? canAdminCloseClient(status) : canTherapistCloseClient(status);
}
