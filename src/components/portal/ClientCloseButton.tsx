"use client";

import { closeClientAction } from "@/lib/portal-actions";
import { portalButtonSecondaryClass } from "@/components/portal/ui";

type Props = {
  clientId: string;
  clientLabel: string;
  returnTo?: string;
};

export function ClientCloseButton({ clientId, clientLabel, returnTo }: Props) {
  return (
    <form
      action={closeClientAction}
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Close ${clientLabel}? Their Google Drive folder will be moved to the therapist's closed cases folder.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="clientId" value={clientId} />
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      <button type="submit" className={portalButtonSecondaryClass}>
        Close client
      </button>
    </form>
  );
}
