"use client";

import { useRouter } from "next/navigation";

type ClientTableRowProps = {
  clientId: string;
  /** Defaults to /portal/admin/clients */
  basePath?: string;
  children: React.ReactNode;
};

export function ClientTableRow({ clientId, basePath = "/portal/admin/clients", children }: ClientTableRowProps) {
  const router = useRouter();
  const href = `${basePath}/${clientId}`;

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
      className="cursor-pointer border-b border-border/60 transition last:border-b-0 hover:bg-primary/5"
    >
      {children}
    </tr>
  );
}
