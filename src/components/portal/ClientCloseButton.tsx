"use client";

import { useState } from "react";
import { closeClientAction } from "@/lib/portal-actions";
import { ClientStatusReasonDialog } from "@/components/portal/ClientStatusReasonDialog";
import { portalButtonSecondaryClass } from "@/components/portal/ui";

type Props = {
  clientId: string;
  clientLabel: string;
  returnTo: string;
};

export function ClientCloseButton({ clientId, clientLabel, returnTo }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={portalButtonSecondaryClass}>
        Close client
      </button>

      <ClientStatusReasonDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Close client"
        description={`Close ${clientLabel}? Their Google Drive folder will be moved to the therapist's closed cases folder.`}
        submitLabel="Close client"
        formAction={closeClientAction}
        clientId={clientId}
        returnTo={returnTo}
        titleId={`close-client-${clientId}`}
      />
    </>
  );
}
