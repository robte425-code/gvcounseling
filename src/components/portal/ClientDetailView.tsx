import type { Gender } from "@/generated/prisma/client";
import {
  portalCardCompactClass,
  portalSectionHeadingClass,
  StatusBadge,
} from "@/components/portal/ui";
import { AttendingNpiSearch } from "@/components/portal/AttendingNpiSearch";
import { formatDate } from "@/lib/constants";

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
  selfInsured: boolean;
  employerFax: string | null;
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

function DetailField({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  if (value === null || value === undefined || value === "" || value === "—") return null;
  return (
    <div className={wide ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-sm leading-snug">{value}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-3 first:border-t-0 first:pt-0">
      <h3 className={`${portalSectionHeadingClass} mb-2`}>{title}</h3>
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </div>
  );
}

function formatGender(gender: Gender | null): string | null {
  if (gender === "F") return "Female";
  if (gender === "M") return "Male";
  if (gender === "U") return "Unknown";
  return null;
}

function formatAddress(
  line1: string | null,
  line2: string | null,
  city: string | null,
  state: string | null,
  zip: string | null,
): string | null {
  const parts = [line1, line2, [city, state].filter(Boolean).join(", "), zip].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function display(value: string | null | undefined): React.ReactNode {
  return value?.trim() || null;
}

export function ClientDetailView({
  client,
  clientId,
}: {
  client: ClientDetailData;
  clientId?: string;
}) {
  const mailing = formatAddress(client.addressLine1, client.addressLine2, client.city, client.state, client.zip);
  const residence = formatAddress(
    client.residenceAddressLine1,
    null,
    client.residenceCity,
    client.residenceState,
    client.residenceZip,
  );
  const fullName = `${client.lastName}, ${client.firstName}${client.middleInitial ? ` ${client.middleInitial}.` : ""}`;

  return (
    <div className={`${portalCardCompactClass} space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        {client.assignmentStatus === "ACTIVE" ? (
          <span className="text-xs text-muted">Active</span>
        ) : (
          <StatusBadge status={client.assignmentStatus} />
        )}
      </div>

      <DetailSection title="Client">
        <DetailField label="Claim #" value={<span className="font-mono">{client.lniClaimNumber}</span>} />
        <DetailField label="Name" value={fullName} />
        <DetailField label="DOB" value={formatDate(client.dateOfBirth)} />
        <DetailField label="Gender" value={formatGender(client.gender)} />
        <DetailField label="Injury date" value={formatDate(client.dateOfInjury)} />
        <DetailField label="Phone" value={display(client.workerPhone)} />
        <DetailField label="Employer" value={display(client.employerName)} />
        {client.selfInsured && (
          <>
            <DetailField label="Self-insured" value="Yes" />
            <DetailField label="Employer fax" value={display(client.employerFax)} />
          </>
        )}
        <DetailField
          label="Diagnoses"
          value={client.diagnoses.length ? client.diagnoses.join(", ") : null}
          wide
        />
      </DetailSection>

      {(mailing || residence) && (
        <DetailSection title="Addresses">
          <DetailField label="Mailing" value={mailing} wide />
          <DetailField label="Residence" value={residence} wide />
        </DetailSection>
      )}

      <DetailSection title="Medical & claims">
        {client.attendingNpi ? (
          <DetailField label="Attending NPI" value={display(client.attendingNpi)} />
        ) : (
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="text-xs text-muted">Attending NPI</dt>
            <dd className="text-sm leading-snug">
              <span className="text-muted">Not set</span>
              {clientId && (
                <AttendingNpiSearch
                  clientId={clientId}
                  doctorName={client.attendingDoctorName}
                  doctorPhone={client.attendingDoctorPhone}
                />
              )}
            </dd>
          </div>
        )}
        <DetailField label="Doctor" value={display(client.attendingDoctorName)} />
        <DetailField label="Doctor phone" value={display(client.attendingDoctorPhone)} />
        <DetailField label="Doctor address" value={display(client.attendingDoctorAddress)} wide />
        <DetailField label="Claim manager" value={display(client.claimManagerName)} />
        <DetailField label="CM phone" value={display(client.claimManagerPhone)} />
        <DetailField label="CM fax" value={display(client.claimManagerFax)} />
        <DetailField label="Legal rep" value={display(client.legalRepresentativeName)} />
        <DetailField label="Legal phone" value={display(client.legalRepresentativePhone)} />
        <DetailField label="Legal address" value={display(client.legalRepresentativeAddress)} wide />
      </DetailSection>

      {(client.vrcName || client.vrcEmail || client.vrcPhone) && (
        <DetailSection title="VRC">
          <DetailField label="Name" value={display(client.vrcName)} />
          <DetailField label="Email" value={display(client.vrcEmail)} />
          <DetailField label="Phone" value={display(client.vrcPhone)} />
        </DetailSection>
      )}

      {(client.clientHistory || client.pgapCoach || client.languages || client.priorServices) && (
        <DetailSection title="Referral notes">
          <DetailField label="PGAP coach" value={display(client.pgapCoach)} />
          <DetailField label="Languages" value={display(client.languages)} />
          <DetailField label="Prior services" value={display(client.priorServices)} />
          <DetailField
            label="History"
            value={
              client.clientHistory ? (
                <span className="whitespace-pre-wrap">{client.clientHistory}</span>
              ) : null
            }
            wide
          />
        </DetailSection>
      )}
    </div>
  );
}
