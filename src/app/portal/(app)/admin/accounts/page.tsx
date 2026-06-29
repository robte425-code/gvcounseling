import { redirect } from "next/navigation";

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deleted?: string; created?: string; emailWarning?: string }>;
}) {
  const { deleted, created, emailWarning } = await searchParams;
  const params = new URLSearchParams();
  if (deleted === "1") params.set("deleted", "1");
  if (created === "1") params.set("created", "1");
  if (emailWarning) params.set("emailWarning", emailWarning);
  const query = params.toString();
  redirect(`/portal/admin/admins${query ? `?${query}` : ""}`);
}
