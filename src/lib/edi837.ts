import { randomBytes } from "crypto";
import { ORG } from "@/lib/constants";

/** CMS place of service: 10 = telehealth provided in patient's home. */
const PLACE_OF_SERVICE = "10";

export type Edi837Client = {
  claimNumber: string;
  lastName: string;
  firstName: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  dateOfBirth: Date;
  gender: "M" | "F" | "U";
  dateOfInjury: Date | null;
  primaryDiagnosis: string;
  additionalDiagnoses: string[];
};

export type Edi837Therapist = {
  lastName: string;
  firstName: string;
  lniProviderId: string;
  npi: string;
};

export type Edi837Line = {
  procedureCode: string;
  amount: number;
  serviceDate: Date;
  units?: number;
};

export type Edi837Claim = {
  clmControlNumber: string;
  client: Edi837Client;
  therapist: Edi837Therapist;
  lines: Edi837Line[];
};

export type Edi837Result = {
  content: string;
  filename: string;
  isaControl: string;
  gsControl: string;
  claimCount: number;
  totalAmount: number;
};

function padLeft(value: string | number, length: number, char = "0"): string {
  return String(value).padStart(length, char);
}

function padRight(value: string, length: number, char = " "): string {
  return value.slice(0, length).padEnd(length, char);
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = padLeft(d.getUTCMonth() + 1, 2);
  const day = padLeft(d.getUTCDate(), 2);
  return `${y}${m}${day}`;
}

function formatTime(d: Date): string {
  return `${padLeft(d.getUTCHours(), 2)}${padLeft(d.getUTCMinutes(), 2)}`;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function generateControl(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length)
    .toUpperCase();
}

function generateNumericControl(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += Math.floor(Math.random() * 10).toString();
  }
  return out;
}

function seg(...elements: string[]): string {
  return elements.join("*") + "~";
}

function hiSegment(primary: string, additional: string[]): string {
  const parts = [`ABK:${primary.replace(".", "")}`];
  for (const dx of additional) {
    parts.push(`ABF:${dx.replace(".", "")}`);
  }
  return seg("HI", parts.join("*"));
}

function buildClaim(hlNumber: number, claim: Edi837Claim): string {
  const { client, therapist, lines } = claim;
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  const demographicDate = client.dateOfBirth;
  const injuryDate = client.dateOfInjury ?? demographicDate;

  let out = "";
  out += seg("HL", String(hlNumber), "1", "22", "0");
  out += seg("SBR", "P", "18", client.claimNumber, "", "", "", "", "WC");
  out += seg(
    "NM1",
    "IL",
    "1",
    client.lastName.toUpperCase(),
    client.firstName.toUpperCase(),
    "",
    "",
    "MI",
    client.claimNumber,
  );
  out += seg("N3", client.addressLine1.toUpperCase());
  out += seg("N4", client.city.toUpperCase(), client.state.toUpperCase(), client.zip.replace(/\D/g, ""));
  out += seg("DMG", "D8", formatDate(demographicDate), client.gender);
  out += seg("NM1", "PR", "2", ORG.receiverName, "", "", "", "PI", ORG.receiverId);
  out += seg("N4", ORG.receiverCity, ORG.receiverState, ORG.receiverZip);
  out += seg("REF", "G2", ORG.lniProviderId);
  out += seg(
    "CLM",
    claim.clmControlNumber,
    formatAmount(total),
    "",
    "",
    "11:B:1",
    "Y",
    "A",
    "Y",
    "Y",
    "",
    "EM",
  );
  out += seg("DTP", "439", "D8", formatDate(injuryDate));
  out += hiSegment(client.primaryDiagnosis, client.additionalDiagnoses);
  out += seg(
    "NM1",
    "82",
    "1",
    therapist.lastName.toUpperCase(),
    therapist.firstName.toUpperCase(),
    "",
    "",
    "XX",
    therapist.npi,
  );
  out += seg("REF", "G2", therapist.lniProviderId);

  lines.forEach((line, idx) => {
    out += seg("LX", String(idx + 1));
    out += seg(
      "SV1",
      `HC:${line.procedureCode}`,
      formatAmount(line.amount),
      "UN",
      String(line.units ?? 1),
      PLACE_OF_SERVICE,
      "",
      "1",
    );
    out += seg("DTP", "472", "D8", formatDate(line.serviceDate));
  });

  return out;
}

export type IsaUsageIndicator = "T" | "P";

function resolveIsaUsageIndicator(): IsaUsageIndicator {
  const value = process.env.EDI_ISA_USAGE_INDICATOR?.trim().toUpperCase();
  return value === "P" ? "P" : "T";
}

/** ISA15 — T = test interchange, P = production. Defaults to T for L&I test uploads. */
export function getIsaUsageIndicator(): IsaUsageIndicator {
  return resolveIsaUsageIndicator();
}

export function parseIsaUsageIndicatorParam(
  value: string | null | undefined,
): IsaUsageIndicator | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized === "T" || normalized === "P" ? normalized : undefined;
}

export function parseIsaUsageIndicatorFromEdi(ediContent: string): "T" | "P" | null {
  const match = ediContent.match(/\*1\*([TP])\*:/);
  if (match?.[1] === "T" || match?.[1] === "P") return match[1];
  return null;
}

export function buildEdi837(
  claims: Edi837Claim[],
  options?: { now?: Date; usageIndicator?: IsaUsageIndicator },
): Edi837Result {
  if (!claims.length) {
    throw new Error("No claims to include in 837 file");
  }

  const now = options?.now ?? new Date();
  const isaControl = generateNumericControl(9);
  const gsControl = padLeft(1, 8);
  const stControl = padLeft(1, 9);
  const usageIndicator = options?.usageIndicator ?? resolveIsaUsageIndicator();
  const date = formatDate(now);
  const time = formatTime(now);
  const yyMMdd = date.slice(2);

  let body = "";
  body += seg("ST", "837", stControl, "005010X222A1");
  body += seg("BHT", "0019", "00", "0001", date, time, "CH");
  body += seg("NM1", "41", "2", ORG.name, "", "", "", "46", ORG.lniProviderId);
  body += seg(
    "PER",
    "IC",
    ORG.contactName,
    "TE",
    ORG.contactPhone,
    "EM",
    ORG.contactEmail,
  );
  body += seg("NM1", "40", "2", ORG.receiverName, "", "", "", "46", ORG.receiverId);
  body += seg("HL", "1", "", "20", "1");
  body += seg("NM1", "85", "2", ORG.name, "", "", "", "XX", ORG.npi);
  body += seg("N3", ORG.addressLine1);
  body += seg("N4", ORG.city, ORG.state, ORG.zip);
  body += seg("REF", "EI", ORG.taxId);

  claims.forEach((claim, idx) => {
    body += buildClaim(idx + 2, claim);
  });

  const segmentCount = body.split("~").filter(Boolean).length + 1;
  body += seg("SE", String(segmentCount), stControl);

  let gs = "";
  gs += seg("GS", "HC", ORG.lniProviderId, ORG.receiverId, date, time, gsControl, "X", "005010X222A1");
  gs += body;
  gs += seg("GE", "1", gsControl);

  let isa = "";
  isa += seg(
    "ISA",
    "00",
    padRight("", 10),
    "00",
    padRight("", 10),
    "ZZ",
    padRight(ORG.lniProviderId, 15),
    "30",
    padRight(ORG.receiverId, 15),
    yyMMdd,
    time,
    "^",
    "00501",
    isaControl,
    "1",
    usageIndicator,
    ":",
  );
  isa += gs;
  isa += seg("IEA", "1", isaControl);

  const totalAmount = claims.reduce(
    (sum, c) => sum + c.lines.reduce((s, l) => s + l.amount, 0),
    0,
  );

  return {
    content: isa,
    filename: `WA_L&I_Grandview_${date}.TXT`,
    isaControl,
    gsControl,
    claimCount: claims.length,
    totalAmount,
  };
}

export function generateClmControlNumber(): string {
  return generateControl(20);
}
