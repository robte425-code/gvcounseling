import Link from "next/link";
import { requireAdmin } from "@/auth";
import { Gender } from "@/generated/prisma/client";
import { saveClientAction } from "@/lib/portal-actions";
import {
  portalButtonClass,
  portalButtonSecondaryClass,
  portalCardClass,
  portalInputClass,
  portalLabelClass,
} from "@/components/portal/ui";
import { client837Ready } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

type ClientFormProps = {
  client?: {
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
    dateOfBirth: Date | null;
    gender: Gender | null;
    dateOfInjury: Date | null;
    vrcName: string | null;
    vrcEmail: string | null;
    vrcPhone: string | null;
    therapistId: string;
  };
};

function dateInputValue(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="border-b border-primary/10 pb-2 font-serif text-xl text-primary-dark">{children}</h2>;
}

export async function ClientForm({ client }: ClientFormProps) {
  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST" },
    orderBy: { lastName: "asc" },
  });

  const readiness = client ? client837Ready(client) : null;

  return (
    <form action={saveClientAction} className={`${portalCardClass} space-y-8`}>
      {client && <input type="hidden" name="id" value={client.id} />}
      {readiness && !readiness.ready && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Missing for 837: {readiness.missing.join(", ")}
        </p>
      )}

      <section className="space-y-4">
        <SectionHeading>Claim &amp; client</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={portalLabelClass}>L&I claim #</label>
            <input
              name="lniClaimNumber"
              required
              defaultValue={client?.lniClaimNumber}
              className={portalInputClass}
            />
          </div>
          <div>
            <label className={portalLabelClass}>Therapist</label>
            <select
              name="therapistId"
              required
              defaultValue={client?.therapistId ?? therapists[0]?.id}
              className={portalInputClass}
            >
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.firstName} {t.lastName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={portalLabelClass}>First name</label>
            <input name="firstName" required defaultValue={client?.firstName} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Last name</label>
            <input name="lastName" required defaultValue={client?.lastName} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Middle initial</label>
            <input name="middleInitial" defaultValue={client?.middleInitial ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Employer name</label>
            <input name="employerName" defaultValue={client?.employerName ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Date of birth</label>
            <input
              name="dateOfBirth"
              type="date"
              defaultValue={dateInputValue(client?.dateOfBirth)}
              className={portalInputClass}
            />
          </div>
          <div>
            <label className={portalLabelClass}>Gender</label>
            <select name="gender" defaultValue={client?.gender ?? ""} className={portalInputClass}>
              <option value="">—</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="U">Unknown / Other</option>
            </select>
          </div>
          <div>
            <label className={portalLabelClass}>Date of injury</label>
            <input
              name="dateOfInjury"
              type="date"
              defaultValue={dateInputValue(client?.dateOfInjury)}
              className={portalInputClass}
            />
          </div>
          <div>
            <label className={portalLabelClass}>Worker phone</label>
            <input name="workerPhone" defaultValue={client?.workerPhone ?? ""} className={portalInputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={portalLabelClass}>Diagnoses (comma-separated ICD codes)</label>
            <input
              name="diagnoses"
              defaultValue={client?.diagnoses.join(", ") ?? ""}
              placeholder="S39.012A, F43.10"
              className={portalInputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Worker mailing address</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={portalLabelClass}>Address line 1</label>
            <input name="addressLine1" defaultValue={client?.addressLine1 ?? ""} className={portalInputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={portalLabelClass}>Address line 2</label>
            <input name="addressLine2" defaultValue={client?.addressLine2 ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>City</label>
            <input name="city" defaultValue={client?.city ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>State</label>
            <input name="state" defaultValue={client?.state ?? "WA"} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>ZIP</label>
            <input name="zip" defaultValue={client?.zip ?? ""} className={portalInputClass} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Worker residence address</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={portalLabelClass}>Address line 1</label>
            <input
              name="residenceAddressLine1"
              defaultValue={client?.residenceAddressLine1 ?? ""}
              className={portalInputClass}
            />
          </div>
          <div>
            <label className={portalLabelClass}>City</label>
            <input name="residenceCity" defaultValue={client?.residenceCity ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>State</label>
            <input name="residenceState" defaultValue={client?.residenceState ?? "WA"} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>ZIP</label>
            <input name="residenceZip" defaultValue={client?.residenceZip ?? ""} className={portalInputClass} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Attending doctor</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={portalLabelClass}>Attending NPI</label>
            <input name="attendingNpi" defaultValue={client?.attendingNpi ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Doctor name</label>
            <input name="attendingDoctorName" defaultValue={client?.attendingDoctorName ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Doctor phone</label>
            <input name="attendingDoctorPhone" defaultValue={client?.attendingDoctorPhone ?? ""} className={portalInputClass} />
          </div>
          <div className="sm:col-span-2">
            <label className={portalLabelClass}>Doctor address</label>
            <input
              name="attendingDoctorAddress"
              defaultValue={client?.attendingDoctorAddress ?? ""}
              className={portalInputClass}
            />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>Claim manager</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={portalLabelClass}>Name</label>
            <input name="claimManagerName" defaultValue={client?.claimManagerName ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Phone</label>
            <input name="claimManagerPhone" defaultValue={client?.claimManagerPhone ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>Fax</label>
            <input name="claimManagerFax" defaultValue={client?.claimManagerFax ?? ""} className={portalInputClass} />
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeading>VRC (from referral)</SectionHeading>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={portalLabelClass}>VRC name</label>
            <input name="vrcName" defaultValue={client?.vrcName ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>VRC email</label>
            <input name="vrcEmail" type="email" defaultValue={client?.vrcEmail ?? ""} className={portalInputClass} />
          </div>
          <div>
            <label className={portalLabelClass}>VRC phone</label>
            <input name="vrcPhone" defaultValue={client?.vrcPhone ?? ""} className={portalInputClass} />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={portalButtonClass}>
          Save client
        </button>
        <Link href="/portal/admin/clients" className={portalButtonSecondaryClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl font-semibold text-primary-dark">Add client</h1>
      <ClientForm />
    </div>
  );
}
