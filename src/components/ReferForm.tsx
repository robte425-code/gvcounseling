"use client";

import { FormEvent, useEffect, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

const REFERRAL_WARNINGS = [
  "Due to a high number of first appointment no-shows, we kindly request that you confirm your client's willingness to participate in BHI services before making a referral. If a client misses their first scheduled appointment without providing a 24-hour notice, no further appointments will be scheduled, and a $220 no-show fee will be billed to the client. Thank you for your understanding.",
  "If your client poses an immediate threat to themselves or others (e.g., violent behavior, threats of violence, suicidal ideation), call 911 immediately. Inform them of the psychiatric emergency and request a Crisis Intervention Team (CIT) officer if available. Additionally, you may call, chat, or text the 9-8-8 national mental health crisis line for assistance with suicidal thoughts, mental health or substance use-related crises, or other emotional distress. Please note, we are unable to provide crisis intervention in an emergency.",
] as const;

function ReferralWarningDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
      aria-labelledby="referral-warning-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close warning"
        onClick={onClose}
      />
      <div className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-xl sm:p-8">
        <h2 id="referral-warning-title" className="font-serif text-2xl font-semibold text-primary-dark">
          Before you refer a client
        </h2>
        <div className="mt-5 space-y-5 text-sm leading-relaxed text-foreground">
          {REFERRAL_WARNINGS.map((text) => (
            <p key={text}>
              <span className="font-semibold text-primary-dark">Important:</span> {text}
            </p>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark"
        >
          I understand
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/20";

const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

function Field({
  label,
  name,
  required,
  type = "text",
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
        {required && <span className="text-primary"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

function FileField({ label, name, required }: { label: string; name: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {label}
        {required && <span className="text-primary"> *</span>}
      </label>
      <input
        id={name}
        name={name}
        type="file"
        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
        required={required}
        className="block w-full text-sm text-muted file:mr-4 file:rounded-full file:border-0 file:bg-primary/10 file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary hover:file:bg-primary/15"
      />
    </div>
  );
}

function RadioGroup({
  legend,
  name,
  options,
  required,
}: {
  legend: string;
  name: string;
  options: string[];
  required?: boolean;
}) {
  return (
    <fieldset>
      <legend className={labelClass}>{legend}{required && <span className="text-primary"> *</span>}</legend>
      <div className="mt-2 flex flex-wrap gap-4">
        {options.map((option) => (
          <label key={option} className="flex items-center gap-2 text-sm text-muted">
            <input
              type="radio"
              name={name}
              value={option}
              required={required}
              className="h-4 w-4 border-border text-primary focus:ring-primary"
            />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ReferForm() {
  const [showWarning, setShowWarning] = useState(true);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    const form = e.currentTarget;
    const data = new FormData(form);

    try {
      const res = await fetch("/api/refer", { method: "POST", body: data });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Something went wrong. Please try again.");
      }
      setStatus("success");
      form.reset();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <>
      <ReferralWarningDialog open={showWarning} onClose={() => setShowWarning(false)} />
      <form onSubmit={handleSubmit} className="space-y-10">
      <section className="space-y-5">
        <h2 className="font-serif text-xl font-semibold text-primary-dark">VRC Info</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Referring VRC Name" name="vrcName" required />
          <Field label="Referring VRC Email" name="vrcEmail" type="email" required />
        </div>
        <RadioGroup
          legend="Preferred method of contact"
          name="contactMethod"
          options={["Email", "Phone"]}
          required
        />
        <Field label="Referring VRC Phone" name="vrcPhone" type="tel" required />
      </section>

      <section className="space-y-5">
        <h2 className="font-serif text-xl font-semibold text-primary-dark">Client Info</h2>
        <Field label="Client name" name="clientName" required placeholder="Client name" />
        <Field
          label="Please enter the LNI claim number(s) associated with the client you are referring."
          name="claimNumbers"
          required
        />

        <FileField
          label={`Please provide a copy of the Client's "Current Claim Status" Screen from the Claim and Account Center (CAC).`}
          name="claimStatusFile"
          required
        />
        <FileField
          label={`Please provide a copy of the Client's "Addresses and Contacts" screen from the Claim and Account Center (CAC).`}
          name="addressesFile"
          required
        />
        <FileField
          label="Please upload the Client's BHI approval letter or chart note from the Attending Provider"
          name="bhiApprovalFile"
          required
        />

        <Field label="Client's Date of Birth" name="clientDob" type="date" />
        <Field label="Client's Email Address" name="clientEmail" type="email" />
        <Field
          label="If client is attending PGAP, please provide Activity coach name"
          name="pgapCoach"
        />
        <Field label="Languages spoken" name="languages" />

        <RadioGroup
          legend="Client's Gender Identity"
          name="genderIdentity"
          options={["Male", "Female", "Other"]}
        />
        <RadioGroup
          legend="Has the client received BHI or mental health services on this claim before?"
          name="priorServices"
          options={["Yes", "No", "Don't know"]}
        />

        <div>
          <label htmlFor="clientHistory" className={labelClass}>
            Please give a brief history or background of the client, attending provider goals and client concerns
          </label>
          <textarea id="clientHistory" name="clientHistory" rows={5} className={inputClass} />
        </div>

        <p className="text-sm text-muted">
          Please attach any progress reports or notes from the claim file that may be helpful for the
          therapist to understand the client&apos;s therapeutic needs
        </p>
        <div className="grid gap-5 sm:grid-cols-2">
          <FileField label="Attached file 1" name="attachment1" />
          <FileField label="Attached file 2" name="attachment2" />
          <FileField label="Attached file 3" name="attachment3" />
          <FileField label="Attached file 4" name="attachment4" />
        </div>
      </section>

      {status === "success" && (
        <p className="rounded-xl bg-primary/10 px-4 py-3 text-sm text-primary-dark" role="status">
          Your referral has been submitted successfully. We will be in touch soon.
        </p>
      )}

      {status === "error" && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={status === "loading"}
          className="rounded-full bg-primary px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-primary-dark disabled:opacity-60"
        >
          {status === "loading" ? "Submitting…" : "Submit"}
        </button>
      </div>
    </form>
    </>
  );
}
