/** Parse VR/OSC "Referral Sheet" / contact info Word docs (not L&I CAC format). */

export type ParsedReferralSheet = {
  clientName?: string;
  claimNumber?: string;
  dateOfBirth?: Date;
  dateOfInjury?: Date;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
  workerPhone?: string;
  attendingDoctorName?: string;
  attendingDoctorAddress?: string;
  attendingDoctorPhone?: string;
  employerName?: string;
  vrcName?: string;
};

function parseDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function parseWorkerAddress(text: string): Pick<
  ParsedReferralSheet,
  "addressLine1" | "city" | "state" | "zip"
> {
  const section =
    text.split(/Injured Worker Information/i)[1]?.split(/Attorney Rep|Claim Information/i)[0] ??
    text;
  const match = section.match(
    /Address:\s*\n?\s*([^\n]+)\s*\n\s*([^,\n]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i,
  );
  if (!match) return {};
  return {
    addressLine1: match[1]!.trim(),
    city: match[2]!.trim(),
    state: match[3]!.trim().toUpperCase(),
    zip: match[4]!.slice(0, 5),
  };
}

function parseAttendingPhysician(text: string): Pick<
  ParsedReferralSheet,
  "attendingDoctorName" | "attendingDoctorAddress" | "attendingDoctorPhone"
> {
  const section = text.split(/Attending Physician/i)[1];
  if (!section) return {};

  const lines = section
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const nameLine = lines.find((l) => /ARNP|MD|DO|DC|PAC|NP/i.test(l) && !/^Phone:/i.test(l));

  const addressMatch = section.match(
    /(\d+[^\n]+)\s*\n\s*([^,\n]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i,
  );
  const phone = section.match(/Phone:\s*([\d().\-\s]+)/i)?.[1]?.replace(/\s+/g, " ").trim();

  let attendingDoctorAddress: string | undefined;
  if (addressMatch) {
    attendingDoctorAddress =
      `${addressMatch[1]!.trim()}, ${addressMatch[2]!.trim()}, ${addressMatch[3]!} ${addressMatch[4]!}`;
  }

  return {
    attendingDoctorName: nameLine?.toUpperCase(),
    attendingDoctorAddress,
    attendingDoctorPhone: phone,
  };
}

export function parseReferralSheetText(text: string): ParsedReferralSheet {
  const workerSection =
    text.split(/Injured Worker Information/i)[1]?.split(/Attorney Rep|Claim Information/i)[0] ?? "";

  const clientName = workerSection.match(/Name:\s*\n?\s*([^\n]+)/i)?.[1]?.trim();
  const dateOfBirth = parseDate(workerSection.match(/Date of birth:\s*\n?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1]);
  const workerPhone = workerSection
    .match(/(?:Home phone|Cell phone):\s*\n?\s*([\d().\-\s]+)/i)?.[1]
    ?.replace(/\s*\(VR\)\s*/i, "")
    .trim();

  const claimSection = text.split(/Claim Information/i)[1] ?? "";
  const claimNumber = claimSection.match(/Claim no\.:\s*\n?\s*([A-Z0-9]+)/i)?.[1]?.trim();
  const dateOfInjury = parseDate(
    claimSection.match(/Date of injury\s*\n?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1],
  );
  const vrcName =
    claimSection.match(/VRC of record:\s*\n?\s*([^\n]+)/i)?.[1]?.trim() ??
    claimSection.match(/Assigned VRC:\s*\n?\s*([^\n]+)/i)?.[1]?.trim();

  const employerSection = text.split(/Stakeholders/i)[1] ?? "";
  const employerName = employerSection
    .match(/Employer\s*\n\s*([^\n]+)\s*\n\s*\d+/i)?.[1]
    ?.trim();

  return {
    clientName,
    claimNumber,
    dateOfBirth,
    dateOfInjury,
    workerPhone,
    vrcName,
    employerName,
    ...parseWorkerAddress(text),
    ...parseAttendingPhysician(text),
  };
}
