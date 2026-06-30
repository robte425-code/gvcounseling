import Link from "next/link";
import type { Gender } from "@/generated/prisma/client";
import { saveClientAction } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardCompactClass,
  portalFormGridClass,
  portalInputCompactClass,
  portalLabelCompactClass,
  portalSectionHeadingClass,
} from "@/components/portal/ui";
import { prisma } from "@/lib/prisma";

export type ClientFormClient = {
  id: string;
  lniClaimNumber: string;
  firstName: string;
  lastName: string;
  middleInitial: string | null;
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
  therapistId: string | null;
  assignmentStatus?: "UNASSIGNED" | "PENDING_THERAPIST" | "ACTIVE" | "REJECTED_BY_ADMIN" | "CLOSED";
};

function dateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className={`${portalSectionHeadingClass} border-b border-border pb-1`}>{children}</h2>;
}

type ClientFormProps = {
  client?: ClientFormClient;
  mode: "admin-create" | "admin-edit" | "therapist-edit";
  cancelHref: string;
};

export async function ClientForm({ client, mode, cancelHref }: ClientFormProps) {
  const therapists =
    mode === "admin-create" || mode === "admin-edit"
      ? await prisma.user.findMany({
          where: { role: "THERAPIST", active: true },
          orderBy: { lastName: "asc" },
        })
      : [];

  const showTherapist =
    mode === "admin-create" || (mode === "admin-edit" && client?.assignmentStatus === "ACTIVE");

  return (
    <form action={saveClientAction} className={`${portalCardCompactClass} space-y-4`}>
      {client && <input type="hidden" name="id" value={client.id} />}
      <input type="hidden" name="returnTo" value={cancelHref} />

      <section className="space-y-2">
        <SectionHeading>Claim &amp; client</SectionHeading>
        <div className={portalFormGridClass}>
          <div>
            <label className={portalLabelCompactClass}>L&I claim #</label>
            <input
              name="lniClaimNumber"
              required
              defaultValue={client?.lniClaimNumber}
              className={portalInputCompactClass}
            />
          </div>
          {showTherapist && (
            <div>
              <label className={portalLabelCompactClass}>Therapist</label>
              <select
                name="therapistId"
                required={mode === "admin-create"}
                defaultValue={client?.therapistId ?? therapists[0]?.id}
                className={portalInputCompactClass}
              >
                {therapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={portalLabelCompactClass}>First name</label>
            <input name="firstName" required defaultValue={client?.firstName} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Last name</label>
            <input name="lastName" required defaultValue={client?.lastName} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Middle initial</label>
            <input name="middleInitial" defaultValue={client?.middleInitial ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Employer name</label>
            <input name="employerName" defaultValue={client?.employerName ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Date of birth</label>
            <input
              name="dateOfBirth"
              type="date"
              defaultValue={dateInputValue(client?.dateOfBirth)}
              className={portalInputCompactClass}
            />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Gender</label>
            <select name="gender" defaultValue={client?.gender ?? ""} className={portalInputCompactClass}>
              <option value="">—</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="U">Unknown / Other</option>
            </select>
          </div>
          <div>
            <label className={portalLabelCompactClass}>Date of injury</label>
            <input
              name="dateOfInjury"
              type="date"
              defaultValue={dateInputValue(client?.dateOfInjury)}
              className={portalInputCompactClass}
            />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Worker phone</label>
            <input name="workerPhone" defaultValue={client?.workerPhone ?? ""} className={portalInputCompactClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={portalLabelCompactClass}>Diagnoses (comma-separated ICD codes)</label>
            <input
              name="diagnoses"
              defaultValue={client?.diagnoses.join(", ") ?? ""}
              placeholder="S39.012A, F43.10"
              className={portalInputCompactClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading>Worker mailing address</SectionHeading>
        <div className={portalFormGridClass}>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={portalLabelCompactClass}>Address line 1</label>
            <input name="addressLine1" defaultValue={client?.addressLine1 ?? ""} className={portalInputCompactClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={portalLabelCompactClass}>Address line 2</label>
            <input name="addressLine2" defaultValue={client?.addressLine2 ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>City</label>
            <input name="city" defaultValue={client?.city ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>State</label>
            <input name="state" defaultValue={client?.state ?? "WA"} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>ZIP</label>
            <input name="zip" defaultValue={client?.zip ?? ""} className={portalInputCompactClass} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading>Worker residence address</SectionHeading>
        <div className={portalFormGridClass}>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={portalLabelCompactClass}>Address line 1</label>
            <input
              name="residenceAddressLine1"
              defaultValue={client?.residenceAddressLine1 ?? ""}
              className={portalInputCompactClass}
            />
          </div>
          <div>
            <label className={portalLabelCompactClass}>City</label>
            <input name="residenceCity" defaultValue={client?.residenceCity ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>State</label>
            <input name="residenceState" defaultValue={client?.residenceState ?? "WA"} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>ZIP</label>
            <input name="residenceZip" defaultValue={client?.residenceZip ?? ""} className={portalInputCompactClass} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading>Attending doctor</SectionHeading>
        <div className={portalFormGridClass}>
          <div>
            <label className={portalLabelCompactClass}>Attending NPI</label>
            <input name="attendingNpi" defaultValue={client?.attendingNpi ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Doctor name</label>
            <input name="attendingDoctorName" defaultValue={client?.attendingDoctorName ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Doctor phone</label>
            <input name="attendingDoctorPhone" defaultValue={client?.attendingDoctorPhone ?? ""} className={portalInputCompactClass} />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={portalLabelCompactClass}>Doctor address</label>
            <input
              name="attendingDoctorAddress"
              defaultValue={client?.attendingDoctorAddress ?? ""}
              className={portalInputCompactClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading>Claim manager</SectionHeading>
        <div className={portalFormGridClass}>
          <div>
            <label className={portalLabelCompactClass}>Name</label>
            <input name="claimManagerName" defaultValue={client?.claimManagerName ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Phone</label>
            <input name="claimManagerPhone" defaultValue={client?.claimManagerPhone ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Fax</label>
            <input name="claimManagerFax" defaultValue={client?.claimManagerFax ?? ""} className={portalInputCompactClass} />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading>Legal representative</SectionHeading>
        <div className={portalFormGridClass}>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={portalLabelCompactClass}>Name / firm</label>
            <input
              name="legalRepresentativeName"
              defaultValue={client?.legalRepresentativeName ?? ""}
              className={portalInputCompactClass}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label className={portalLabelCompactClass}>Address</label>
            <input
              name="legalRepresentativeAddress"
              defaultValue={client?.legalRepresentativeAddress ?? ""}
              className={portalInputCompactClass}
            />
          </div>
          <div>
            <label className={portalLabelCompactClass}>Phone</label>
            <input
              name="legalRepresentativePhone"
              defaultValue={client?.legalRepresentativePhone ?? ""}
              className={portalInputCompactClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <SectionHeading>VRC (from referral)</SectionHeading>
        <div className={portalFormGridClass}>
          <div>
            <label className={portalLabelCompactClass}>VRC name</label>
            <input name="vrcName" defaultValue={client?.vrcName ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>VRC email</label>
            <input name="vrcEmail" type="email" defaultValue={client?.vrcEmail ?? ""} className={portalInputCompactClass} />
          </div>
          <div>
            <label className={portalLabelCompactClass}>VRC phone</label>
            <input name="vrcPhone" defaultValue={client?.vrcPhone ?? ""} className={portalInputCompactClass} />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={portalButtonClass}>
          Save client
        </button>
        <Link href={cancelHref} className={portalButtonSecondaryClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
