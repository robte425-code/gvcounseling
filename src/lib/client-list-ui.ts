import type { ClientAssignmentStatus } from "@/generated/prisma/client";

export type ClientListRow = {
  id: string;
  firstName: string;
  lastName: string;
  lniClaimNumber: string;
  assignmentStatus: ClientAssignmentStatus;
  createdAt?: Date | string;
  therapistName?: string | null;
  invoiceCount?: number;
};

export const NEW_CLIENT_WINDOW_DAYS = 7;

export function isNewClient(createdAt: Date | string | undefined | null): boolean {
  if (!createdAt) return false;
  const created = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  if (Number.isNaN(created.getTime())) return false;
  const cutoff = Date.now() - NEW_CLIENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return created.getTime() >= cutoff;
}

export type ClientStatusFilterOption = {
  label: string;
  value: string | undefined;
  count?: number;
  highlight?: boolean;
  active: boolean;
};

export function clientListLabel(client: Pick<ClientListRow, "firstName" | "lastName">): string {
  return `${client.lastName}, ${client.firstName}`;
}
