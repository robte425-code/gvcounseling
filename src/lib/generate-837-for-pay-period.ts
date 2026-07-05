import {
  buildEdi837,
  generateClmControlNumber,
  type Edi837Claim,
  type Edi837Result,
  type IsaUsageIndicator,
} from "@/lib/edi837";
import { client837Ready, resolveClientBirthDate } from "@/lib/constants";
import { invoice837PayPeriodWhere } from "@/lib/invoice-list-filters";
import { loadAllProcedureCodeFees, resolveFeeAmount } from "@/lib/procedure-fees";
import { prisma } from "@/lib/prisma";

type InvoiceFor837 = {
  invoiceNumber: number;
  clmControlNumber: string | null;
  client: {
    lniClaimNumber: string;
    lastName: string;
    firstName: string;
    attendingNpi: string | null;
    addressLine1: string | null;
    city: string | null;
    state: string;
    zip: string | null;
    dateOfBirth: Date | null;
    gender: "M" | "F" | "U" | null;
    dateOfInjury: Date | null;
    diagnoses: string[];
  };
  therapist: {
    lastName: string;
    firstName: string;
    lniProviderId: string | null;
    npi: string | null;
  };
  lineItems: {
    procedureCode: string;
    amount: unknown;
    serviceDate: Date;
    units: number;
  }[];
};

const invoice837Include = {
  client: true,
  therapist: true,
  lineItems: { orderBy: { sortOrder: "asc" as const } },
};

async function buildEdiClaimsForInvoices(invoices: InvoiceFor837[]): Promise<Edi837Claim[]> {
  const blocked: string[] = [];
  for (const inv of invoices) {
    const readiness = client837Ready(inv.client);
    if (!readiness.ready) {
      blocked.push(`${inv.client.lniClaimNumber} (${readiness.missing.join(", ")})`);
    }
    if (!inv.therapist.lniProviderId) {
      blocked.push(`${inv.client.lniClaimNumber} (therapist L&I ID missing)`);
    }
    if (!inv.therapist.npi) {
      blocked.push(`${inv.client.lniClaimNumber} (therapist NPI missing)`);
    }
  }
  if (blocked.length) {
    throw new Error(`Cannot generate 837. Missing data: ${blocked.slice(0, 5).join("; ")}`);
  }

  const lniFeeSchedule = await loadAllProcedureCodeFees();
  const missingFees: string[] = [];

  const claims: Edi837Claim[] = invoices.map((inv) => {
    const dx = inv.client.diagnoses;
    return {
      clmControlNumber: inv.clmControlNumber ?? generateClmControlNumber(),
      client: {
        claimNumber: inv.client.lniClaimNumber,
        lastName: inv.client.lastName,
        firstName: inv.client.firstName,
        addressLine1: inv.client.addressLine1!,
        city: inv.client.city!,
        state: inv.client.state,
        zip: inv.client.zip!,
        dateOfBirth: resolveClientBirthDate(inv.client)!,
        gender: inv.client.gender ?? "U",
        dateOfInjury: inv.client.dateOfInjury,
        primaryDiagnosis: dx[0]!,
        additionalDiagnoses: dx.slice(1),
      },
      therapist: {
        lastName: inv.therapist.lastName,
        firstName: inv.therapist.firstName,
        lniProviderId: inv.therapist.lniProviderId!,
        npi: inv.therapist.npi!,
      },
      lines: inv.lineItems.map((line) => {
        const feeAmount = resolveFeeAmount(lniFeeSchedule, line.procedureCode, line.serviceDate);
        if (feeAmount === null) {
          missingFees.push(
            `${line.procedureCode} on ${line.serviceDate.toISOString().slice(0, 10)} (invoice #${inv.invoiceNumber})`,
          );
        }
        return {
          procedureCode: line.procedureCode,
          amount: feeAmount ?? Number(line.amount),
          serviceDate: line.serviceDate,
          units: line.units,
        };
      }),
    };
  });

  if (missingFees.length) {
    throw new Error(
      `Cannot generate 837. No L&I fee on file for: ${missingFees.slice(0, 5).join("; ")}. Add fees on the Billing page.`,
    );
  }

  return claims;
}

export async function generate837ForPayPeriod(
  payPeriodId: string,
  options?: { usageIndicator?: IsaUsageIndicator },
): Promise<Edi837Result> {
  const payPeriod = await prisma.payPeriod.findUnique({ where: { id: payPeriodId } });
  if (!payPeriod) throw new Error("Pay period not found.");

  const invoices = await prisma.invoice.findMany({
    where: invoice837PayPeriodWhere(payPeriodId),
    include: invoice837Include,
    orderBy: [{ therapist: { lastName: "asc" } }, { invoiceNumber: "asc" }],
  });

  if (!invoices.length) {
    throw new Error(
      "No invoices are assigned to this pay period. Assign submitted invoices on the Invoices page first.",
    );
  }

  const claims = await buildEdiClaimsForInvoices(invoices);
  return buildEdi837(claims, { usageIndicator: options?.usageIndicator });
}
