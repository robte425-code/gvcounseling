const FAXAGE_API_URL = "https://api.faxage.com/httpsfax.php";

export type FaxageConfig = {
  username: string;
  company: string;
  password: string;
  tagname: string;
  tagnumber: string;
};

export function getFaxageConfig(): FaxageConfig {
  const username = process.env.FAXAGE_USERNAME?.trim();
  const company = process.env.FAXAGE_COMPANY?.trim();
  const password = process.env.FAXAGE_PASSWORD?.trim();
  const tagnumber = process.env.FAXAGE_TAGNUMBER?.trim();
  const tagname = process.env.FAXAGE_TAGNAME?.trim() || "gvcounseling";

  if (!username || !company || !password || !tagnumber) {
    throw new Error(
      "Faxage credentials not configured (FAXAGE_USERNAME, FAXAGE_COMPANY, FAXAGE_PASSWORD, FAXAGE_TAGNUMBER).",
    );
  }

  return { username, company, password, tagname, tagnumber };
}

/** Normalize to 10-digit US fax number for Faxage. */
export function normalizeFaxNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  if (digits.length !== 10) {
    throw new Error(`Invalid fax number (expected 10 digits): ${value}`);
  }
  return digits;
}

export type SendFaxOptions = {
  faxno: string;
  recipname: string;
  filenames: string[];
  fileDataBase64: string[];
};

export type SendFaxResult = {
  jobId: string;
  raw: string;
};

/** Faxage tagnumber header format: 1.XXX.XXX.XXXX (14 chars max). */
export function normalizeFaxageTagNumber(value: string): string {
  const trimmed = value.trim();
  if (/^1\.\d{3}\.\d{3}\.\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  const ten =
    digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits.length === 10 ? digits : null;
  if (!ten) {
    throw new Error(
      `Invalid FAXAGE_TAGNUMBER (expected 10-digit outbound fax or 1.XXX.XXX.XXXX format): ${value}`,
    );
  }

  return `1.${ten.slice(0, 3)}.${ten.slice(3, 6)}.${ten.slice(6)}`;
}

function truncateRecipname(value: string): string {
  return value.trim().slice(0, 32);
}

function parseFaxageResponse(raw: string): SendFaxResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Faxage returned an empty response.");
  }

  if (/^ERR\d{2}:/i.test(trimmed)) {
    throw new Error(trimmed);
  }

  const jobMatch = trimmed.match(/JOBID:\s*(\d+)/i);
  if (!jobMatch?.[1]) {
    throw new Error(`Unexpected Faxage response: ${trimmed}`);
  }

  return { jobId: jobMatch[1], raw: trimmed };
}

export async function sendFax(options: SendFaxOptions): Promise<SendFaxResult> {
  const config = getFaxageConfig();
  const faxno = normalizeFaxNumber(options.faxno);

  if (options.filenames.length !== options.fileDataBase64.length) {
    throw new Error("Fax filenames and file data counts must match.");
  }
  if (options.filenames.length === 0) {
    throw new Error("At least one fax file is required.");
  }

  const body = new URLSearchParams();
  body.append("username", config.username);
  body.append("company", config.company);
  body.append("password", config.password);
  body.append("operation", "sendfax");
  body.append("recipname", truncateRecipname(options.recipname));
  body.append("faxno", faxno);
  body.append("tagname", config.tagname);
  body.append("tagnumber", normalizeFaxageTagNumber(config.tagnumber));

  for (let i = 0; i < options.filenames.length; i++) {
    body.append("faxfilenames[]", options.filenames[i]!);
    body.append("faxfiledata[]", options.fileDataBase64[i]!);
  }

  const res = await fetch(FAXAGE_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const raw = (await res.text()).trim();
  if (!res.ok) {
    throw new Error(`Faxage HTTP ${res.status}: ${raw || res.statusText}`);
  }

  return parseFaxageResponse(raw);
}
