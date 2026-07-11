"use client";

import { useState } from "react";
import { ConfirmSubmitButton } from "@/components/portal/ConfirmSubmitButton";
import {
  deleteInvoiceNoteAction,
  updateInvoiceNoteAction,
} from "@/lib/portal-actions";
import {
  portalButtonSecondaryClass,
  portalInputClass,
} from "@/components/portal/ui";

type Props = {
  noteId: string;
  invoiceId: string;
  returnTo: string;
  body: string;
  metaLabel: string;
  canModify: boolean;
};

export function InvoiceNoteItem({
  noteId,
  invoiceId,
  returnTo,
  body,
  metaLabel,
  canModify,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="rounded-xl border border-border bg-primary/5 px-4 py-3">
      <p className="text-xs font-medium text-muted">{metaLabel}</p>

      {editing ? (
        <form action={updateInvoiceNoteAction} className="mt-3 space-y-3">
          <input type="hidden" name="noteId" value={noteId} />
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <textarea
            name="body"
            rows={4}
            required
            defaultValue={body}
            className={portalInputClass}
          />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={portalButtonSecondaryClass}>
              Save changes
            </button>
            <button
              type="button"
              className={portalButtonSecondaryClass}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{body}</p>
          {canModify && (
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setEditing(true)}
              >
                Edit
              </button>
              <form action={deleteInvoiceNoteAction}>
                <input type="hidden" name="noteId" value={noteId} />
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <ConfirmSubmitButton
                  confirmMessage="Delete this note?"
                  className="text-sm text-red-700 hover:underline"
                >
                  Delete
                </ConfirmSubmitButton>
              </form>
            </div>
          )}
        </>
      )}
    </li>
  );
}
