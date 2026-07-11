import {
  formatInvoiceNoteAuthorName,
  formatInvoiceNoteTimestamp,
  loadInvoiceNotes,
  wasInvoiceNoteEdited,
} from "@/lib/invoice-notes";
import { InvoiceNoteItem } from "@/components/portal/InvoiceNoteItem";
import { addInvoiceNoteAction } from "@/lib/portal-actions";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

type Props = {
  invoiceId: string;
  returnTo: string;
};

export async function InvoiceNotesSection({ invoiceId, returnTo }: Props) {
  const notes = await loadInvoiceNotes(invoiceId);

  return (
    <section className={portalCardClass}>
      <h2 className="font-serif text-xl font-semibold text-primary-dark">Invoice notes</h2>
      <p className="mt-1 text-sm text-muted">
        Add timestamped notes to this invoice. Authors and admins can edit or delete notes.
      </p>

      {notes.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {notes.map((note) => {
            const edited = wasInvoiceNoteEdited(note.createdAt, note.updatedAt);
            const metaLabel = [
              formatInvoiceNoteTimestamp(note.createdAt),
              formatInvoiceNoteAuthorName(note.author),
              edited ? `Edited ${formatInvoiceNoteTimestamp(note.updatedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <InvoiceNoteItem
                key={note.id}
                noteId={note.id}
                invoiceId={invoiceId}
                returnTo={returnTo}
                body={note.body}
                metaLabel={metaLabel}
                canModify={note.canModify}
              />
            );
          })}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted">No notes yet.</p>
      )}

      <form action={addInvoiceNoteAction} className="mt-6 space-y-3 border-t border-border pt-6">
        <input type="hidden" name="invoiceId" value={invoiceId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <label htmlFor={`invoice-note-${invoiceId}`} className={portalLabelClass}>
            Add note
          </label>
          <textarea
            id={`invoice-note-${invoiceId}`}
            name="body"
            rows={4}
            required
            className={portalInputClass}
            placeholder="Enter a note about this invoice…"
          />
        </div>
        <button type="submit" className={portalButtonSecondaryClass}>
          Save note
        </button>
      </form>
    </section>
  );
}
