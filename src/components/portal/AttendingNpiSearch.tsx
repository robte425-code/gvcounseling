"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseCityStateFromAddress, parseDoctorNameForNpiSearch } from "@/lib/npi-registry";
import { portalButtonClass, portalButtonSecondaryClass, portalCardCompactClass } from "@/components/portal/ui";

type NpiProvider = {
  npi: string;
  name: string;
  credential: string | null;
  specialty: string | null;
  address: string | null;
  phone: string | null;
};

type AttendingNpiSearchProps = {
  clientId: string;
  doctorName: string | null;
  doctorAddress: string | null;
  city: string | null;
  state: string;
};

export function AttendingNpiSearch({
  clientId,
  doctorName,
  doctorAddress,
  city,
  state,
}: AttendingNpiSearchProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingNpi, setSavingNpi] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<NpiProvider[]>([]);

  async function handleSearch() {
    setLoading(true);
    setError(null);
    setProviders([]);
    setOpen(true);

    try {
      const response = await fetch(`/api/portal/clients/${clientId}/attending-npi`);
      const data = (await response.json()) as { providers?: NpiProvider[]; error?: string };
      if (!response.ok) {
        setError(data.error ?? "NPI search failed.");
        return;
      }
      setProviders(data.providers ?? []);
      if ((data.providers ?? []).length === 0) {
        setError("No matching providers found in the NPI Registry.");
      }
    } catch {
      setError("NPI search failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelect(npi: string) {
    setSavingNpi(npi);
    setError(null);
    try {
      const response = await fetch(`/api/portal/clients/${clientId}/attending-npi`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npi }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save NPI.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not save NPI.");
    } finally {
      setSavingNpi(null);
    }
  }

  const disabled = !doctorName?.trim();
  const parsed = doctorName ? parseDoctorNameForNpiSearch(doctorName) : null;
  const fromAddress = parseCityStateFromAddress(doctorAddress);
  const searchCity = city?.trim() || fromAddress.city;
  const searchState = (state?.trim() || fromAddress.state || "WA").toUpperCase();

  return (
    <div className="mt-2 space-y-2">
      {!disabled && parsed && (
        <p className="text-xs text-muted">
          Uses doctor and location from this client record (referral import):{" "}
          <span className="font-medium text-foreground">
            {parsed.firstName} {parsed.lastName}
          </span>
          {searchCity || searchState ? (
            <>
              {" "}
              in{" "}
              <span className="font-medium text-foreground">
                {[searchCity, searchState].filter(Boolean).join(", ")}
              </span>
            </>
          ) : null}
        </p>
      )}
      <button
        type="button"
        onClick={handleSearch}
        disabled={disabled || loading}
        className={portalButtonSecondaryClass}
        title={
          disabled
            ? "Referral import did not include an attending doctor name"
            : "Search CMS NPI Registry using scanned client data"
        }
      >
        {loading ? "Searching…" : "Search NPI"}
      </button>
      {disabled && (
        <p className="text-xs text-muted">
          No attending doctor on file from the referral import. Re-sync from Drive or edit the client
          to add the doctor name, then search again.
        </p>
      )}

      {open && (
        <div className={`${portalCardCompactClass} space-y-3`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-primary-dark">NPI Registry results</p>
              {doctorName && parsed && (
                <p className="text-xs text-muted">
                  From client record:{" "}
                  <span className="font-medium">
                    {parsed.firstName} {parsed.lastName}
                  </span>
                  {(searchCity || searchState) && (
                    <>
                      {" "}
                      · {[searchCity, searchState].filter(Boolean).join(", ")}
                    </>
                  )}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-muted hover:text-primary-dark"
            >
              Close
            </button>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}

          {providers.length > 0 && (
            <ul className="divide-y divide-border text-sm">
              {providers.map((provider) => (
                <li key={provider.npi} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-primary-dark">
                      {provider.name}
                      {provider.credential ? `, ${provider.credential}` : ""}
                    </p>
                    <p className="font-mono text-xs text-muted">NPI {provider.npi}</p>
                    {provider.specialty && (
                      <p className="mt-0.5 text-xs text-muted">{provider.specialty}</p>
                    )}
                    {provider.address && (
                      <p className="mt-0.5 text-xs text-muted">{provider.address}</p>
                    )}
                    {provider.phone && (
                      <p className="text-xs text-muted">{provider.phone}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={savingNpi !== null}
                    onClick={() => handleSelect(provider.npi)}
                    className={portalButtonClass}
                  >
                    {savingNpi === provider.npi ? "Saving…" : "Select"}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-muted">
            Data from{" "}
            <a
              href="https://npiregistry.cms.hhs.gov/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              CMS NPI Registry
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
