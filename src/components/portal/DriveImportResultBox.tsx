type ImportResult = {
  created?: number;
  updated?: number;
  closed?: number;
  unchanged?: number;
  skipped?: number;
  errors?: string[];
  warnings?: string[];
  error?: string;
};

export function DriveImportResultBox({ result }: { result: ImportResult | null }) {
  if (!result) return null;
  if (result.error) {
    return <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{result.error}</p>;
  }
  const hasActivity =
    (result.created ?? 0) > 0 ||
    (result.updated ?? 0) > 0 ||
    (result.closed ?? 0) > 0 ||
    (result.skipped ?? 0) > 0 ||
    (result.warnings?.length ?? 0) > 0 ||
    (result.errors?.length ?? 0) > 0;
  if (!hasActivity && (result.unchanged ?? 0) > 0) {
    return (
      <p className="mt-4 rounded-xl bg-primary/5 px-4 py-3 text-sm text-muted">
        No changes. {result.unchanged} client folder{result.unchanged === 1 ? "" : "s"} already in sync.
      </p>
    );
  }
  if (!hasActivity) {
    return (
      <p className="mt-4 rounded-xl bg-primary/5 px-4 py-3 text-sm text-muted">No changes found.</p>
    );
  }
  return (
    <div className="mt-4 space-y-2 rounded-xl bg-primary/5 px-4 py-3 text-sm">
      {result.created != null && <p>Created: {result.created}</p>}
      {result.updated != null && result.updated > 0 && <p>Updated: {result.updated}</p>}
      {result.closed != null && result.closed > 0 && <p>Closed: {result.closed}</p>}
      {result.unchanged != null && result.unchanged > 0 && (
        <p className="text-muted">Unchanged: {result.unchanged}</p>
      )}
      {result.skipped != null && result.skipped > 0 && <p>Skipped: {result.skipped}</p>}
      {result.warnings?.map((w) => (
        <p key={w} className="text-amber-900">
          {w}
        </p>
      ))}
      {result.errors?.map((err) => (
        <p key={err} className="text-red-800">
          {err}
        </p>
      ))}
    </div>
  );
}
