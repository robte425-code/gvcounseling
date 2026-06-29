import type { NextAuthConfig } from "next-auth";
import { Role } from "@/generated/prisma/client";
import type { ImpersonationUpdate } from "@/types/next-auth";

type AdminSnapshot = {
  id: string;
  role: Role;
  firstName: string;
  lastName: string;
};

export const authConfig = {
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/portal/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (trigger === "update" && session) {
        const impersonation = (session as { impersonation?: ImpersonationUpdate }).impersonation;
        if (impersonation?.action === "start") {
          if (!token.adminSnapshot) {
            token.adminSnapshot = {
              id: token.id as string,
              role: token.role as Role,
              firstName: token.firstName as string,
              lastName: token.lastName as string,
            } satisfies AdminSnapshot;
          }
          const admin = token.adminSnapshot as AdminSnapshot;
          token.realUserId = admin.id;
          token.realRole = admin.role;
          token.id = impersonation.user.id;
          token.role = impersonation.user.role;
          token.firstName = impersonation.user.firstName;
          token.lastName = impersonation.user.lastName;
          token.impersonatingUserId = impersonation.user.id;
        }
        if (impersonation?.action === "stop" && token.adminSnapshot) {
          const admin = token.adminSnapshot as AdminSnapshot;
          token.id = admin.id;
          token.role = admin.role;
          token.firstName = admin.firstName;
          token.lastName = admin.lastName;
          delete token.realUserId;
          delete token.realRole;
          delete token.impersonatingUserId;
          delete token.adminSnapshot;
        }
        if (session.user?.mustChangePassword !== undefined) {
          token.mustChangePassword = session.user.mustChangePassword;
        }
        if (session.user?.firstName !== undefined) {
          token.firstName = session.user.firstName;
          if (token.adminSnapshot) {
            (token.adminSnapshot as AdminSnapshot).firstName = session.user.firstName;
          }
        }
        if (session.user?.lastName !== undefined) {
          token.lastName = session.user.lastName;
          if (token.adminSnapshot) {
            (token.adminSnapshot as AdminSnapshot).lastName = session.user.lastName;
          }
        }
      }
      if (user) {
        token.id = user.id!;
        token.role = (user as { role: Role }).role;
        token.mustChangePassword = (user as { mustChangePassword: boolean }).mustChangePassword;
        token.firstName = (user as { firstName: string }).firstName;
        token.lastName = (user as { lastName: string }).lastName;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
        session.user.firstName = token.firstName as string;
        session.user.lastName = token.lastName as string;
        session.user.realUserId = token.realUserId as string | undefined;
        session.user.realRole = token.realRole as Role | undefined;
        session.user.isImpersonating = !!token.impersonatingUserId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
