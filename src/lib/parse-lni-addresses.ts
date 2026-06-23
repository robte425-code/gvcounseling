import { parseLniCacText, type ParsedLniCacFields } from "@/lib/parse-lni-cac-fields";

export type ParsedAddressesContacts = Pick<
  ParsedLniCacFields,
  | "claimNumber"
  | "clientName"
  | "dateOfInjury"
  | "mailingAddressLine1"
  | "mailingCity"
  | "mailingState"
  | "mailingZip"
  | "residenceAddressLine1"
  | "residenceCity"
  | "residenceState"
  | "residenceZip"
  | "workerPhone"
  | "vrcName"
  | "vrcPhone"
  | "warnings"
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

export function parseLniAddressesText(rawText: string): ParsedAddressesContacts {
  return parseLniCacText(rawText, { requireMailingAddress: true });
}
