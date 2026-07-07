import type { Role } from "@/generated/prisma/client";

export const GOOGLE_DRIVE_ADMIN_PAGE = "/portal/admin/integrations/google-drive";

export function googleDriveIntegrationsPath(role: Role): string {
  return role === "THERAPIST" ? "/portal/therapist/dashboard" : GOOGLE_DRIVE_ADMIN_PAGE;
}

export function googleDriveConnectCallbackPath(role: Role): string {
  return googleDriveIntegrationsPath(role);
}
