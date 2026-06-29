import { redirect } from "next/navigation";
import { auth, portalHomePath } from "@/auth";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/portal/login");
  redirect(portalHomePath(session));
}
