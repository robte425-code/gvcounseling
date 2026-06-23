import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { portalHomePath } from "@/lib/session";

export default async function PortalIndexPage() {
  const session = await auth();
  if (!session?.user) redirect("/portal/login");
  if (session.user.mustChangePassword) redirect("/portal/change-password");
  redirect(portalHomePath(session));
}
