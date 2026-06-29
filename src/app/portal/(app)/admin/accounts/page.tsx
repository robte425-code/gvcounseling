import { redirect } from "next/navigation";

export default async function AdminAccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; deleted?: string }>;
}) {
  const { q, deleted } = await searchParams;
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  if (deleted === "1") params.set("deleted", "1");
  const query = params.toString();
  redirect(`/portal/profile${query ? `?${query}` : ""}#portal-logins`);
}
