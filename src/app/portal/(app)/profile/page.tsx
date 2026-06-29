import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, getRealRole, getRealUserId, isImpersonating, portalHomePath } from "@/auth";
import { ProfileForm } from "@/components/portal/ProfileForm";
import { portalButtonSecondaryClass } from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; emailChanged?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal/login");
  if (isImpersonating(session)) redirect(portalHomePath(session));

  const { saved, emailChanged } = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: getRealUserId(session) },
    select: { email: true, firstName: true, lastName: true },
  });

  return (
    <div className="space-y-4">
      {saved === "1" && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark">
          Profile saved. Your name in the header will update immediately.
          {emailChanged === "1" && " Sign in with your new email address next time."}
        </p>
      )}

      <div>
        <Link href={portalHomePath(session)} className={`${portalButtonSecondaryClass} text-xs`}>
          ← Back to dashboard
        </Link>
        <h1 className="mt-3 font-serif text-2xl font-semibold text-primary-dark">Account</h1>
        <p className="mt-1 text-sm text-muted">
          Update the name shown in the portal header.
          {getRealRole(session) === "ADMIN"
            ? " Admins can also change their login email."
            : " Contact an admin to change your login email."}
        </p>
      </div>

      <ProfileForm
        email={user.email}
        firstName={user.firstName}
        lastName={user.lastName}
        canEditEmail={getRealRole(session) === "ADMIN"}
      />
    </div>
  );
}
