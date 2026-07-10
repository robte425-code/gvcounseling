"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type Props = {
  href: string;
  children: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
};

type TableCellProps = {
  className?: string;
  role?: string;
  tabIndex?: number;
  onClick?: (event: MouseEvent<HTMLTableCellElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTableCellElement>) => void;
};

function isTableCell(child: ReactNode): child is ReactElement<TableCellProps> {
  return isValidElement(child) && child.type === "td";
}

export function InvoiceTableRow({ href, children, actions, leading }: Props) {
  const router = useRouter();

  function openInvoice() {
    router.push(href);
  }

  function makeCellInteractive(child: ReactElement<TableCellProps>) {
    return cloneElement(child, {
      onClick: (event: MouseEvent<HTMLTableCellElement>) => {
        child.props.onClick?.(event);
        if (!event.defaultPrevented) openInvoice();
      },
      onKeyDown: (event: KeyboardEvent<HTMLTableCellElement>) => {
        child.props.onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openInvoice();
        }
      },
      className: `${child.props.className ?? ""} cursor-pointer`.trim(),
      role: "link",
      tabIndex: 0,
    });
  }

  return (
    <tr className="border-b border-border/60 transition hover:bg-primary/5">
      {leading ? (
        <td className="py-3 pr-2">
          <div
            className="flex items-center"
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {leading}
          </div>
        </td>
      ) : null}
      {Children.map(children, (child) => (isTableCell(child) ? makeCellInteractive(child) : child))}
      <td className="py-3 text-right">
        <div
          onClick={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      </td>
    </tr>
  );
}
