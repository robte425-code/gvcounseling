"use client";

import { useRouter } from "next/navigation";

type ClientTableRowProps = {
  clientId: string;
  children: React.ReactNode;
};

export function ClientTableRow({ clientId, children }: ClientTableRowProps) {
  const router = useRouter();

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/portal/admin/clients/${clientId}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(`/portal/admin/clients/${clientId}`);
        }
      }}
      className="cursor-pointer border-b border-border/60 transition hover:bg-primary/5"
    >
      {children}
    </tr>
  );
}
