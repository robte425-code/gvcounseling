import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function PortalIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal/login");
  if (session.user.mustChangePassword) redirect("/portal/change-password");
  redirect(
    session.user.role === "ADMIN"
      ? "/portal/admin/dashboard"
      : "/portal/therapist/dashboard",
  );
}
