import type { Role } from "@/generated/prisma/client";

export function googleDriveIntegrationsPath(role: Role): string {
  return role === "THERAPIST"
    ? "/portal/therapist/integrations"
    : "/portal/admin/clients/import";
}

export function googleDriveConnectCallbackPath(role: Role): string {
  return googleDriveIntegrationsPath(role);
}
