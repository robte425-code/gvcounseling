import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { authConfig } from "@/auth.config";
import { getRealRole, isImpersonating } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export { getRealRole, getRealUserId, isImpersonating, portalHomePath } from "@/lib/session";

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toString().toLowerCase().trim();
        const password = credentials?.password?.toString();
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
          mustChangePassword: user.mustChangePassword,
          firstName: user.firstName,
          lastName: user.lastName,
        };
      },
    }),
  ],
});

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/portal/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (getRealRole(session) !== "ADMIN") {
    redirect("/portal/therapist/dashboard");
  }
  if (isImpersonating(session)) {
    redirect("/portal/therapist/dashboard");
  }
  return session;
}

export async function requireTherapist() {
  const session = await requireSession();
  if (session.user.role !== "THERAPIST") {
    redirect("/portal/admin/dashboard");
  }
  return session;
}

/** Use in Route Handlers instead of requireAdmin() — returns JSON errors, never redirect(). */
export async function requireAdminApi() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (getRealRole(session) !== "ADMIN") {
    return { ok: false as const, response: Response.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { ok: true as const, session, role: "ADMIN" as const };
}

/** Admin or therapist (not while impersonating). */
export async function requirePortalDriveApi() {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (isImpersonating(session)) {
    return {
      ok: false as const,
      response: Response.json(
        { error: "Exit therapist view before connecting Google Drive." },
        { status: 403 },
      ),
    };
  }

  const role = getRealRole(session);
  if (role !== "ADMIN" && role !== "THERAPIST") {
    return { ok: false as const, response: Response.json({ error: "Forbidden." }, { status: 403 }) };
  }

  return { ok: true as const, session, role };
}
