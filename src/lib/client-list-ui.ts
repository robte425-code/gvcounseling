import type { ClientAssignmentStatus } from "@/generated/prisma/client";

export type ClientListRow = {
  id: string;
  firstName: string;
  lastName: string;
  lniClaimNumber: string;
  assignmentStatus: ClientAssignmentStatus;
  therapistName?: string | null;
  invoiceCount?: number;
};

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
