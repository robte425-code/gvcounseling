import { extractClaimNumber } from "@/lib/constants";

export type ParsedAddressesContacts = {
  claimNumber?: string;
  clientName?: string;
  dateOfInjury?: Date;
  addressLine1?: string;
  city?: string;
  state?: string;
  zip?: string;
  vrcName?: string;
  vrcPhone?: string;
  warnings: string[];
};

function parseInjuryDate(raw?: string): Date | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function normalizeAddressesText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\t+/g, " ").trim();
}

function parseWorkerAddress(text: string): Pick<
  ParsedAddressesContacts,
  "addressLine1" | "city" | "state" | "zip"
> {
  const section =
    text.split(/Worker(?:'s)? mail(?:ing)? address/i)[1] ??
    text.split(/Worker residence address/i)[1] ??
    text;

  const match = section.match(
    /\n?\s*(\d+[^\n]+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|BLVD|WAY|CT|COURT|PL|PLACE|HWY|PIKE)[^\n]*)\s*\n\s*([A-Z][A-Z\s.'-]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i,
  );

  if (!match) return {};

  return {
    addressLine1: match[1]!.trim().toUpperCase(),
    city: match[2]!.trim().toUpperCase(),
    state: match[3]!.trim().toUpperCase(),
    zip: match[4]!.slice(0, 5),
  };
}

function parseVrcContact(text: string): Pick<ParsedAddressesContacts, "vrcName" | "vrcPhone"> {
  const section = text.split(/Vocational counselor/i)[1];
  if (!section) return {};

  const counselorLine = section.match(/^\s*([^\n]+)/m)?.[1];
  let vrcName: string | undefined;
  if (counselorLine) {
    const parts = counselorLine.split(/\t+|\s{2,}/).map((p) => p.trim());
    vrcName = parts.find((p) => /\bVRC\b/i.test(p));
  }

  const phoneMatch = section.match(/(\d{3}-\d{3}-\d{4})/);
  const vrcPhone = phoneMatch?.[1];

  if (!vrcName) {
    const claimManager = text.match(/Claim Manager\s+([A-Z][A-Z\s.'-]+?)\s+\d{3}-\d{3}-\d{4}/i);
    if (claimManager?.[1]) {
      return { vrcName: claimManager[1].trim(), vrcPhone };
    }
  }

  return { vrcName, vrcPhone };
}

export function parseLniAddressesText(rawText: string): ParsedAddressesContacts {
  const text = normalizeAddressesText(rawText);
  const warnings: string[] = [];

  const claimRaw = text.match(/Claim number\s+([A-Z0-9]+)/i)?.[1];
  const claimNumber = extractClaimNumber(claimRaw);

  const injuryRaw = text.match(/Injury date\s+(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1];
  const dateOfInjury = parseInjuryDate(injuryRaw);

  const clientName = text.match(
    /Worker name\s+([A-Z][A-Z\s'-]+?)(?=\s+Employer|\s+Attending|\n|$)/i,
  )?.[1]?.trim();

  const address = parseWorkerAddress(text);
  if (!address.addressLine1) warnings.push("Could not find worker mailing address");

  const vrc = parseVrcContact(text);

  return {
    claimNumber,
    clientName,
    dateOfInjury,
    ...address,
    ...vrc,
    warnings,
  };
}
