"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

type Props = {
  href: string;
  children: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
};

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "a, button, input, label, select, textarea, [data-no-row-nav]",
    ),
  );
}

export function InvoiceTableRow({ href, children, actions, leading }: Props) {
  const router = useRouter();

  function openInvoice() {
    router.push(href);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || isInteractiveTarget(event.target)) return;
    openInvoice();
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.defaultPrevented || isInteractiveTarget(event.target)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInvoice();
    }
  }

  return (
    <tr
      role="link"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleRowKeyDown}
      className="cursor-pointer border-b border-border/60 transition hover:bg-primary/5"
    >
      {leading ? (
        <td
          className="py-3 pr-2"
          data-no-row-nav
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-center" data-no-row-nav>
            {leading}
          </div>
        </td>
      ) : null}
      {children}
      <td
        className="py-3 text-right"
        data-no-row-nav
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div data-no-row-nav>{actions}</div>
      </td>
    </tr>
  );
}
