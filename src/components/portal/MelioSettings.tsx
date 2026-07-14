"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMelioBillsInboxAction } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";

type Props = {
  inboxEmail: string | null;
};

export function MelioSettings({ inboxEmail }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(inboxEmail ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setEmail(inboxEmail ?? "");
  }, [inboxEmail]);

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateMelioBillsInboxAction(email);
      if (result.error) {
        setError(result.error);
        return;
      }
      setEmail(result.email ?? "");
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <section className={portalCardClass}>
      <p className={portalSectionHeadingClass}>Payments</p>
      <h2 className="mt-1 font-serif text-lg font-semibold text-primary-dark">Melio</h2>
      <p className="mt-1 text-sm text-muted">
        Regular Melio accounts do not expose a payment API. This portal builds Melio bill CSVs and
        can email bill PDFs to your Melio capture inbox so payouts show up under Bills ready to pay
        by ACH.
      </p>

      <div className="mt-4">
        <label htmlFor="melio-bills-inbox" className={portalLabelCompactClass}>
          Melio bills inbox email
        </label>
        <input
          id="melio-bills-inbox"
          type="email"
          placeholder="your-business@invoicesmelio.com"
          value={email}
          disabled={pending}
          onChange={(event) => {
            setEmail(event.target.value);
            setSaved(false);
          }}
          className={portalInputCompactClass}
        />
        <p className="mt-1 text-xs text-muted">
          Find this in Melio under Settings / Pay Bills email (ends with @invoicesmelio.com). Leave
          blank to disable email send; CSV export still works.
        </p>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="mt-3 rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary-dark" role="status">
          Melio inbox saved.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-3">
        <button type="button" onClick={onSave} disabled={pending} className={portalButtonClass}>
          {pending ? "Saving…" : "Save Melio inbox"}
        </button>
        <a href="/api/portal/melio/vendors" className={portalButtonSecondaryClass}>
          Download therapist vendors CSV
        </a>
      </div>
    </section>
  );
}
