import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { authConfig } from "@/auth.config";
import { getRealRole, getRealUserId, isImpersonating } from "@/lib/session";
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
        if (user.role === "THERAPIST" && !user.active) return null;

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

/**
 * Re-checks against the database that the signed-in account still exists and is
 * still allowed in.
 *
 * The session is a JWT, so nothing in it reflects a change made after sign-in.
 * Without this, deactivating a therapist left their existing session working —
 * they kept reading client DOBs, diagnoses, and claim numbers until the token
 * aged out, and a password reset did not evict them either.
 */
async function isSessionStillValid(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, active: true },
  });
  if (!user) return false;
  // Mirrors the sign-in rule in authorize().
  if (user.role === "THERAPIST" && !user.active) return false;
  return true;
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/portal/login");
  }
  // The real user, not an impersonated one — an admin viewing as a therapist is
  // still governed by their own account.
  if (!(await isSessionStillValid(getRealUserId(session)))) {
    redirect("/portal/login?signedOut=1");
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
  if (!(await isSessionStillValid(getRealUserId(session)))) {
    return { ok: false as const, response: Response.json({ error: "Unauthorized." }, { status: 401 }) };
  }
  if (getRealRole(session) !== "ADMIN") {
    return { ok: false as const, response: Response.json({ error: "Forbidden." }, { status: 403 }) };
  }
  if (isImpersonating(session)) {
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
  if (!(await isSessionStillValid(getRealUserId(session)))) {
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
