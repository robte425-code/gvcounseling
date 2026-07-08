"use client";

import { useEffect, useState } from "react";
import {
  acceptUnassignedClientAction,
  requestVrcInfoAction,
} from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";
import type { OutboundEmailRoute } from "@/lib/portal-settings";

type Props = {
  clientId: string;
  vrcEmail: string | null;
  vrcName: string | null;
  vrcRoute: OutboundEmailRoute;
  adminEmails: string[];
};

function RequestInfoDialog({
  open,
  onClose,
  clientId,
  vrcRoute,
  adminEmails,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  vrcRoute: OutboundEmailRoute;
  adminEmails: string[];
}) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="request-vrc-info-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
      />
      <form
        action={requestVrcInfoAction}
        className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl"
      >
        <input type="hidden" name="clientId" value={clientId} />
        <h2
          id="request-vrc-info-title"
          className="font-serif text-xl font-semibold text-primary-dark"
        >
          Request more information
        </h2>
        <p className="mt-2 text-sm text-muted">
          {vrcRoute === "admin"
            ? `VRC email testing is on — this goes to admins (${adminEmails.join(", ")}) instead of the VRC.`
            : "This email goes to the referring VRC. They can reply directly to your admin email."}
        </p>
        <div className="mt-4">
          <label htmlFor="vrcInfoMessage" className={portalLabelClass}>
            Message to VRC
          </label>
          <textarea
            id="vrcInfoMessage"
            name="message"
            rows={6}
            required
            className={portalInputClass}
            placeholder="Please provide…"
          />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onClose} className={portalButtonSecondaryClass}>
            Cancel
          </button>
          <button type="submit" className={portalButtonClass}>
            Send email
          </button>
        </div>
      </form>
    </div>
  );
}

export function ClientVrcReferralActions({
  clientId,
  vrcEmail,
  vrcName,
  vrcRoute,
  adminEmails,
}: Props) {
  const [requestInfoOpen, setRequestInfoOpen] = useState(false);
  const hasVrcEmail = Boolean(vrcEmail?.trim());
  const adminMode = vrcRoute === "admin";
  const canSend = adminMode || hasVrcEmail;

  return (
    <div className="space-y-3 border-b border-border pb-6">
      <h3 className="font-serif text-lg text-primary-dark">VRC referral</h3>
      <p className="text-sm text-muted">
        Notify the referring VRC that the referral was received, or request additional information.
      </p>

      {adminMode && (
        <p className="rounded-xl bg-primary/5 px-4 py-3 text-sm text-primary-dark">
          VRC emails are routed to admins ({adminEmails.join(", ")}). Change this on the Admin page.
        </p>
      )}

      {!hasVrcEmail && !adminMode && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No VRC email on file. Add one on the Edit client page before sending emails.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <form action={acceptUnassignedClientAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <button type="submit" disabled={!canSend} className={portalButtonClass}>
            Accept client
          </button>
        </form>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => setRequestInfoOpen(true)}
          className={portalButtonSecondaryClass}
        >
          Request more info
        </button>
      </div>

      {hasVrcEmail && !adminMode && (
        <p className="text-xs text-muted">
          Emails will be sent to {vrcEmail}
          {vrcName ? ` (${vrcName})` : ""}.
        </p>
      )}

      <RequestInfoDialog
        open={requestInfoOpen}
        onClose={() => setRequestInfoOpen(false)}
        clientId={clientId}
        vrcRoute={vrcRoute}
        adminEmails={adminEmails}
      />
    </div>
  );
}
