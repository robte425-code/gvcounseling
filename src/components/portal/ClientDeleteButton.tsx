"use client";

import { deleteClientAction } from "@/lib/portal-actions";

type Props = {
  clientId: string;
  clientLabel: string;
  returnTo?: string;
  disabled?: boolean;
  className?: string;
};

export function ClientDeleteButton({
  clientId,
  clientLabel,
  returnTo,
  disabled = false,
  className = "text-sm text-red-700 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline",
}: Props) {
  return (
    <form
      action={deleteClientAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Delete ${clientLabel}? This cannot be undone.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="id" value={clientId} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <button
        type="submit"
        disabled={disabled}
        title={disabled ? "Cannot delete a client with invoices" : "Delete client"}
        className={className}
      >
        Delete client
      </button>
    </form>
  );
}
