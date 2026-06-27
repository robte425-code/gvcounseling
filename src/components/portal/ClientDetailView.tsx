import type { Gender } from "@/generated/prisma/client";
import { portalCardClass, StatusBadge } from "@/components/portal/ui";
import { client837Ready, formatDate } from "@/lib/constants";

export type ClientDetailData = {
  lniClaimNumber: string;
  firstName: string;
  lastName: string;
  middleInitial: string | null;
  assignmentStatus: string;
  attendingNpi: string | null;
  diagnoses: string[];
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string;
  zip: string | null;
  residenceAddressLine1: string | null;
  residenceCity: string | null;
  residenceState: string | null;
  residenceZip: string | null;
  workerPhone: string | null;
  employerName: string | null;
  attendingDoctorName: string | null;
  attendingDoctorAddress: string | null;
  attendingDoctorPhone: string | null;
  claimManagerName: string | null;
  claimManagerPhone: string | null;
  claimManagerFax: string | null;
  legalRepresentativeName: string | null;
  legalRepresentativeAddress: string | null;
  legalRepresentativePhone: string | null;
  dateOfBirth: Date | null;
  gender: Gender | null;
  dateOfInjury: Date | null;
  vrcName: string | null;
  vrcEmail: string | null;
  vrcPhone: string | null;
  clientHistory: string | null;
  pgapCoach: string | null;
  languages: string | null;
  priorServices: string | null;
};

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value ?? "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${portalCardClass} space-y-4`}>
      <h2 className="border-b border-primary/10 pb-2 font-serif text-xl text-primary-dark">{title}</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function formatGender(gender: Gender | null): string {
  if (gender === "F") return "Female";
  if (gender === "M") return "Male";
  if (gender === "U") return "Unknown / Other";
  return "—";
}

function formatAddress(line1: string | null, line2: string | null, city: string | null, state: string | null, zip: string | null): string {
  const parts = [line1, line2, [city, state].filter(Boolean).join(", "), zip].filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

export function ClientDetailView({ client }: { client: ClientDetailData }) {
  const readiness = client837Ready(client);

  return (
    <div className="space-y-6">
      <div className={portalCardClass}>
        <div className="flex flex-wrap items-center gap-3">
          {client.assignmentStatus === "ACTIVE" ? (
            <span className="text-sm text-muted">Active</span>
          ) : (
            <StatusBadge status={client.assignmentStatus} />
          )}
          {readiness.ready ? (
            <StatusBadge status="READY" />
          ) : (
            <span className="text-sm text-amber-800">837 missing: {readiness.missing.join(", ")}</span>
          )}
        </div>
      </div>

      <Section title="Claim & client">
        <DetailField label="L&I claim #" value={<span className="font-mono">{client.lniClaimNumber}</span>} />
        <DetailField label="Name" value={`${client.lastName}, ${client.firstName}${client.middleInitial ? ` ${client.middleInitial}.` : ""}`} />
        <DetailField label="Date of birth" value={formatDate(client.dateOfBirth)} />
        <DetailField label="Gender" value={formatGender(client.gender)} />
        <DetailField label="Date of injury" value={formatDate(client.dateOfInjury)} />
        <DetailField label="Employer" value={client.employerName} />
        <DetailField label="Worker phone" value={client.workerPhone} />
        <DetailField label="Diagnoses" value={client.diagnoses.length ? client.diagnoses.join(", ") : "—"} />
      </Section>

      <Section title="Worker mailing address">
        <div className="sm:col-span-2">
          <DetailField
            label="Address"
            value={formatAddress(client.addressLine1, client.addressLine2, client.city, client.state, client.zip)}
          />
        </div>
      </Section>

      {(client.residenceAddressLine1 || client.residenceCity) && (
        <Section title="Worker residence address">
          <div className="sm:col-span-2">
            <DetailField
              label="Address"
              value={formatAddress(
                client.residenceAddressLine1,
                null,
                client.residenceCity,
                client.residenceState,
                client.residenceZip,
              )}
            />
          </div>
        </Section>
      )}

      <Section title="Attending doctor">
        <DetailField label="Attending NPI" value={client.attendingNpi} />
        <DetailField label="Doctor name" value={client.attendingDoctorName} />
        <DetailField label="Doctor phone" value={client.attendingDoctorPhone} />
        <div className="sm:col-span-2">
          <DetailField label="Doctor address" value={client.attendingDoctorAddress} />
        </div>
      </Section>

      <Section title="Claim manager">
        <DetailField label="Name" value={client.claimManagerName} />
        <DetailField label="Phone" value={client.claimManagerPhone} />
        <DetailField label="Fax" value={client.claimManagerFax} />
      </Section>

      {(client.legalRepresentativeName || client.legalRepresentativePhone) && (
        <Section title="Legal representative">
          <div className="sm:col-span-2">
            <DetailField label="Name / firm" value={client.legalRepresentativeName} />
          </div>
          <div className="sm:col-span-2">
            <DetailField label="Address" value={client.legalRepresentativeAddress} />
          </div>
          <DetailField label="Phone" value={client.legalRepresentativePhone} />
        </Section>
      )}

      <Section title="VRC">
        <DetailField label="VRC name" value={client.vrcName} />
        <DetailField label="VRC email" value={client.vrcEmail} />
        <DetailField label="VRC phone" value={client.vrcPhone} />
      </Section>

      {(client.clientHistory || client.pgapCoach || client.languages || client.priorServices) && (
        <Section title="Referral notes">
          {client.pgapCoach && <DetailField label="PGAP coach" value={client.pgapCoach} />}
          {client.languages && <DetailField label="Languages" value={client.languages} />}
          {client.priorServices && <DetailField label="Prior services" value={client.priorServices} />}
          {client.clientHistory && (
            <div className="sm:col-span-2">
              <DetailField label="Client history" value={<span className="whitespace-pre-wrap font-normal">{client.clientHistory}</span>} />
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
