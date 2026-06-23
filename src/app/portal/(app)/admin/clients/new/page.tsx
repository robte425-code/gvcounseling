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

export async function ClientForm({ client }: ClientFormProps) {
  const therapists = await prisma.user.findMany({
    where: { role: "THERAPIST" },
    orderBy: { lastName: "asc" },
  });

  const readiness = client ? client837Ready(client) : null;

  return (
    <form action={saveClientAction} className={`${portalCardClass} space-y-6`}>
      {client && <input type="hidden" name="id" value={client.id} />}
      {readiness && !readiness.ready && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Missing for 837: {readiness.missing.join(", ")}
        </p>
      )}
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
          <label className={portalLabelClass}>Attending NPI</label>
          <input name="attendingNpi" defaultValue={client?.attendingNpi ?? ""} className={portalInputClass} />
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
