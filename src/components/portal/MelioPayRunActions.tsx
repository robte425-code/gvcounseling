"use client";

import { useActionState } from "react";
import {
  markMelioExportedAction,
  sendMelioBillsAction,
  type MarkMelioExportedState,
  type SendMelioBillsState,
} from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
} from "@/components/portal/ui";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";

const sendInitial: SendMelioBillsState = {};
const markInitial: MarkMelioExportedState = {};

export function MelioPayRunActions({
  remittanceAdviceId,
  billCount,
  melioExportedAtLabel,
  hasMelioInbox,
}: {
  remittanceAdviceId: string;
  billCount: number;
  melioExportedAtLabel: string | null;
  hasMelioInbox: boolean;
}) {
  const [sendState, sendAction, sendPending] = useActionState(sendMelioBillsAction, sendInitial);
  const [markState, markAction, markPending] = useActionState(markMelioExportedAction, markInitial);

  const csvHref = `/api/portal/melio/bills?remittanceAdviceId=${encodeURIComponent(remittanceAdviceId)}&mark=1`;

  return (
    <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-primary-dark">Melio payout</p>
        <p className="mt-1 text-xs text-muted">
          Export {billCount} therapist bill{billCount === 1 ? "" : "s"} for Melio (Bills → Import
          spreadsheet), or email PDF bills to your Melio capture inbox.
          {melioExportedAtLabel ? ` Last exported ${melioExportedAtLabel}.` : ""}
        </p>
      </div>

      {(sendState.error || markState.error) && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {sendState.error || markState.error}
        </p>
      )}
      {sendState.success && (
        <p className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark" role="status">
          {sendState.success}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <a href={csvHref} className={`${portalButtonSecondaryClass} text-center`}>
          Download Melio bills CSV
        </a>

        <form action={sendAction}>
          <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
          <ConfirmSubmitButton
            confirmMessage={`Email ${billCount} bill PDF${billCount === 1 ? "" : "s"} to your Melio bills inbox?\n\nThey will appear under Bills in Melio for ACH payment.`}
            className={portalButtonClass}
            disabled={sendPending || !hasMelioInbox}
          >
            {sendPending
              ? "Sending…"
              : hasMelioInbox
                ? "Email bills to Melio inbox"
                : "Set Melio inbox in Admin first"}
          </ConfirmSubmitButton>
        </form>

        {!melioExportedAtLabel && (
          <form action={markAction}>
            <input type="hidden" name="remittanceAdviceId" value={remittanceAdviceId} />
            <button
              type="submit"
              disabled={markPending}
              className="text-xs text-muted underline hover:text-primary-dark"
            >
              {markPending ? "Saving…" : "Mark as exported without download"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
