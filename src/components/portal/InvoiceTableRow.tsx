"use client";

import { useRouter } from "next/navigation";

type Props = {
  href: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
};

export function InvoiceTableRow({ href, children, actions, leading }: Props) {
  const router = useRouter();

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
      className="cursor-pointer border-b border-border/60 transition hover:bg-primary/5"
    >
      {leading ? (
        <td
          className="py-3 pr-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {leading}
        </td>
      ) : null}
      {children}
      <td
        className="py-3 text-right"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {actions}
      </td>
    </tr>
  );
}
