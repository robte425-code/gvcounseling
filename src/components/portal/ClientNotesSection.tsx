import {
  formatClientNoteAuthorName,
  formatClientNoteTimestamp,
  loadClientNotes,
  wasClientNoteEdited,
} from "@/lib/client-notes";
import { ClientNoteItem } from "@/components/portal/ClientNoteItem";
import { addClientNoteAction } from "@/lib/portal-actions";
import {
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";

type Props = {
  clientId: string;
  returnTo: string;
};

export async function ClientNotesSection({ clientId, returnTo }: Props) {
  const notes = await loadClientNotes(clientId);

  return (
    <section className={portalCardClass}>
      <h2 className="font-serif text-xl font-semibold text-primary-dark">Client notes</h2>
      <p className="mt-1 text-sm text-muted">
        Add timestamped notes to this client file. Authors and admins can edit or delete notes.
      </p>

      {notes.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {notes.map((note) => {
            const edited = wasClientNoteEdited(note.createdAt, note.updatedAt);
            const metaLabel = [
              formatClientNoteTimestamp(note.createdAt),
              formatClientNoteAuthorName(note.author),
              edited ? `Edited ${formatClientNoteTimestamp(note.updatedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <ClientNoteItem
                key={note.id}
                noteId={note.id}
                clientId={clientId}
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

      <form action={addClientNoteAction} className="mt-6 space-y-3 border-t border-border pt-6">
        <input type="hidden" name="clientId" value={clientId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <div>
          <label htmlFor={`client-note-${clientId}`} className={portalLabelClass}>
            Add note
          </label>
          <textarea
            id={`client-note-${clientId}`}
            name="body"
            rows={4}
            required
            className={portalInputClass}
            placeholder="Enter a note about this client…"
          />
        </div>
        <button type="submit" className={portalButtonSecondaryClass}>
          Save note
        </button>
      </form>
    </section>
  );
}
