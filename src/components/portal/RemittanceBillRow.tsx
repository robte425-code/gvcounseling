"use client";

import { useRouter } from "next/navigation";

type RowProps = {
  invoiceHref?: string;
  className?: string;
  children: React.ReactNode;
};

export function RemittanceBillRow({ invoiceHref, className, children }: RowProps) {
  const router = useRouter();
  const interactive = Boolean(invoiceHref);

  return (
    <li
      role={interactive ? "link" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? () => router.push(invoiceHref!) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                router.push(invoiceHref!);
              }
            }
          : undefined
      }
      className={`rounded-lg border px-3 py-2 text-sm ${
        interactive ? "cursor-pointer transition hover:bg-primary/5" : ""
      } ${className ?? ""}`}
    >
      {children}
    </li>
  );
}

type ActionsProps = {
  children: React.ReactNode;
};

/** Prevents row navigation when clicking supersede / rebill controls. */
export function RemittanceBillRowActions({ children }: ActionsProps) {
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}
