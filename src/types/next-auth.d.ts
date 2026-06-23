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
    };
  }

  interface User {
    role: Role;
    mustChangePassword: boolean;
    firstName: string;
    lastName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    mustChangePassword: boolean;
    firstName: string;
    lastName: string;
  }
}
