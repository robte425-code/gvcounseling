import { parseLniCacText, type ParsedLniCacFields } from "@/lib/parse-lni-cac-fields";

export type ParsedClaimStatus = Pick<
  ParsedLniCacFields,
  "claimNumber" | "clientName" | "dateOfInjury" | "diagnoses" | "warnings"
> &
  Partial<
    Pick<
      ParsedLniCacFields,
      | "employerName"
      | "attendingDoctorName"
      | "attendingDoctorAddress"
      | "attendingDoctorPhone"
      | "claimManagerName"
      | "claimManagerPhone"
      | "claimManagerFax"
    >
  >;

export function parseLniClaimStatusText(rawText: string): ParsedClaimStatus {
  const parsed = parseLniCacText(rawText, { requireDiagnoses: true });
  return parsed;
}
