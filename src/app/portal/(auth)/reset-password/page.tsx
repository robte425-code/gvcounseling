import Link from "next/link";
import { ResetPasswordForm } from "@/components/portal/ResetPasswordForm";
import { portalButtonClass, portalCardClass } from "@/components/portal/ui";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token?.trim()) {
    return (
      <div className={portalCardClass}>
        <h1 className="font-serif text-2xl font-semibold text-primary-dark">Invalid reset link</h1>
        <p className="mt-2 text-sm text-muted">
          This password reset link is missing or invalid. Request a new link from the sign-in page.
        </p>
        <Link href="/portal/forgot-password" className={`${portalButtonClass} mt-6 inline-block text-center`}>
          Request reset link
        </Link>
      </div>
    );
  }

  return <ResetPasswordForm token={token.trim()} />;
}
