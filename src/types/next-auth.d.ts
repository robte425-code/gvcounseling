import { Role } from "@/generated/prisma/client";
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      role: Role;
      mustChangePassword: boolean;
      firstName: string;
      lastName: string;
      /** Logged-in user id (admin) while impersonating */
      realUserId?: string;
      /** Logged-in user role while impersonating */
      realRole?: Role;
      isImpersonating?: boolean;
    };
  }

  interface User {
    role: Role;
    mustChangePassword: boolean;
    firstName: string;
    lastName: string;
  }
}

type AdminSnapshot = {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
};

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustChangePassword: boolean;
    firstName: string;
    lastName: string;
    realUserId?: string;
    realRole?: Role;
    impersonatingUserId?: string;
    adminSnapshot?: AdminSnapshot;
  }
}

export type ImpersonationUpdate =
  | {
      action: "start";
      user: { id: string; role: Role; firstName: string; lastName: string };
    }
  | { action: "stop" };
