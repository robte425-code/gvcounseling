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

/**
 * Invoice list row. When `leading` (e.g. a checkbox) is present, the row is not a
 * link — nesting controls inside role="link" breaks checkbox clicks in browsers.
 * Callers should put a normal <Link> on the invoice number instead.
 */
export function InvoiceTableRow({ href, children, actions, leading }: Props) {
  const router = useRouter();
  const rowIsLink = !leading;

  function openInvoice() {
    router.push(href);
  }

  function handleRowClick(event: MouseEvent<HTMLTableRowElement>) {
    if (!rowIsLink || event.defaultPrevented || isInteractiveTarget(event.target)) return;
    openInvoice();
  }

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (!rowIsLink || event.defaultPrevented || isInteractiveTarget(event.target)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openInvoice();
    }
  }

  return (
    <tr
      role={rowIsLink ? "link" : undefined}
      tabIndex={rowIsLink ? 0 : undefined}
      onClick={rowIsLink ? handleRowClick : undefined}
      onKeyDown={rowIsLink ? handleRowKeyDown : undefined}
      className={`border-b border-border/60 transition hover:bg-primary/5 ${
        rowIsLink ? "cursor-pointer" : ""
      }`}
    >
      {leading ? (
        <td className="w-10 py-3 pr-2 align-middle" data-no-row-nav>
          {leading}
        </td>
      ) : null}
      {children}
      <td className="py-3 text-right" data-no-row-nav>
        {actions}
      </td>
    </tr>
  );
}
