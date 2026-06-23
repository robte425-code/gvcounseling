/**
 * Import one Drive client folder and verify required fields + PDF cross-check.
 * Usage: npx tsx scripts/import-and-verify-client.ts BJ87697
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { isPlausibleIcdCode } from "../src/lib/constants";
import { importClientDocumentsFromFolderDetailed } from "../src/lib/client-document-import";
import {
  formatMissingRequiredFields,
  getMissingRequiredImportFields,
  validateAndRepairClientImport,
} from "../src/lib/client-import-quality";
import { scanDriveClientFolders, importDriveClientFolder } from "../src/lib/drive-client-import";
import {
  downloadFileBuffer,
  downloadReferralDocx,
  findReferralSubmissionFile,
  listClientFolderFiles,
} from "../src/lib/google-drive";
import { parseReferralDocx } from "../src/lib/referral-parser";
import { prisma } from "../src/lib/prisma";
import { extractPdfText } from "../src/lib/pdf-text";
import mammoth from "mammoth";

async function extractCacText(
  token: string,
  file: { id: string; name: string; mimeType: string },
): Promise<string> {
  const buffer = await downloadFileBuffer(token, file);
  if (
    file.mimeType.includes("word") ||
    file.mimeType.includes("document") ||
    file.name.endsWith(".docx")
  ) {
    return (await mammoth.extractRawText({ buffer })).value;
  }
  return (await extractPdfText(buffer)).text;
}

async function verifyAgainstPdfs(
  token: string,
  folderId: string,
  client: {
    employerName?: string | null;
    claimManagerName?: string | null;
    attendingDoctorName?: string | null;
    addressLine1?: string | null;
  },
): Promise<string[]> {
  const issues: string[] = [];
  const files = await listClientFolderFiles(token, folderId);
  const cacFiles = files.filter(
    (f) =>
      (/pdf|google-apps|word|document/i.test(f.mimeType) ||
        f.name.endsWith(".pdf") ||
        f.name.endsWith(".docx")) &&
      /cac|address|contact|claim status|claim &/i.test(f.name),
  );
  if (!cacFiles.length) {
    issues.push("no CAC PDF found for cross-check");
    return issues;
  }

  let text = "";
  for (const f of cacFiles) {
    text += "\n" + (await extractCacText(token, f));
  }
  const upper = text.toUpperCase();

  const check = (label: string, value?: string | null) => {
    if (!value?.trim()) return;
    const parts = value.trim().split(/\s+/).filter(Boolean);
    const lastName = parts.length >= 2 ? parts[parts.length - 1]! : parts[0]!;
    if (!upper.includes(lastName.toUpperCase())) {
      issues.push(`${label} "${value}" not found in CAC docs`);
    }
  };

  check("employer", client.employerName);
  check("claim manager", client.claimManagerName);
  check("doctor", client.attendingDoctorName);

  const addrToken = client.addressLine1?.match(/\d+/)?.[0];
  if (addrToken && !upper.includes(addrToken)) {
    issues.push(`address "${client.addressLine1}" not in CAC docs`);
  }

  return issues;
}

export async function importAndVerifyClaim(claim: string): Promise<{
  claim: string;
  pass: boolean;
  issues: string[];
  record?: Record<string, unknown>;
}> {
  const admin = await prisma.user.findFirst({ where: { email: "ghim@gvcounseling.com" } });
  if (!admin) throw new Error("Admin user not found");

  const { folders } = await scanDriveClientFolders(admin.id);
  const folder = folders.find((f) => f.folderName.startsWith(`${claim} `));
  if (!folder) throw new Error(`Folder not found for claim ${claim}`);

  const result = await importDriveClientFolder(admin.id, folder);
  if (result.errors.length) {
    return { claim, pass: false, issues: result.errors };
  }

  const c = await prisma.client.findUnique({ where: { lniClaimNumber: claim } });
  if (!c) return { claim, pass: false, issues: ["client not created in DB"] };

  const token = await (async () => {
    const { getValidGoogleAccessToken } = await import("../src/lib/google-oauth");
    return getValidGoogleAccessToken(admin.id);
  })();

  const refFile = await findReferralSubmissionFile(token, folder.folderId);
  const ref = refFile ? await parseReferralDocx(await downloadReferralDocx(token, refFile)) : undefined;
  const { parts, merged } = await importClientDocumentsFromFolderDetailed(token, folder.folderId);
  const quality = validateAndRepairClientImport(ref ?? { diagnoses: [], warnings: [] }, merged, {
    documentParts: parts,
    folderClaimNumber: claim,
  });

  const supplement = quality.supplement;
  const missing = getMissingRequiredImportFields(ref, supplement);
  const badDx = c.diagnoses.filter((d) => !isPlausibleIcdCode(d));
  const pdfIssues = await verifyAgainstPdfs(token, folder.folderId, c);

  const issues: string[] = [];
  if (missing.length) issues.push(`missing: ${formatMissingRequiredFields(missing)}`);
  if (badDx.length) issues.push(`bad diagnoses: ${badDx.join(", ")}`);
  issues.push(...pdfIssues);

  const record = {
    name: `${c.firstName} ${c.lastName}`,
    employer: c.employerName,
    doctor: c.attendingDoctorName,
    claimMgr: c.claimManagerName,
    claimPhone: c.claimManagerPhone,
    mailing: [c.addressLine1, c.city, c.state, c.zip].filter(Boolean).join(", "),
    residence: [c.residenceAddressLine1, c.residenceCity, c.residenceState, c.residenceZip]
      .filter(Boolean)
      .join(", "),
    vrc: c.vrcName,
    doi: c.dateOfInjury?.toISOString().slice(0, 10),
    diagnoses: c.diagnoses,
    importWarnings: result.warnings.filter(
      (w) => w.includes("Missing required") || w.includes("error"),
    ),
  };

  return { claim, pass: issues.length === 0, issues, record };
}

async function main() {
  const claim = process.argv[2];
  if (!claim) {
    console.error("Usage: npx tsx scripts/import-and-verify-client.ts <CLAIM>");
    process.exit(1);
  }
  const r = await importAndVerifyClaim(claim);
  console.log(r.pass ? "PASS" : "FAIL", r.claim);
  console.log(JSON.stringify({ issues: r.issues, record: r.record }, null, 2));
  process.exit(r.pass ? 0 : 1);
}

if (process.argv[1]?.includes("import-and-verify-client")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
