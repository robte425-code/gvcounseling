/**
 * Debug a Drive client folder: list files + parse CAC/referral text snippets.
 * Usage: npx tsx scripts/debug-client-folder.ts BJ91086
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { scanDriveClientFolders } from "../src/lib/drive-client-import";
import {
  downloadFileBuffer,
  downloadReferralDocx,
  findReferralSubmissionFile,
  listClientFolderFiles,
} from "../src/lib/google-drive";
import { getValidGoogleAccessToken } from "../src/lib/google-oauth";
import { parseReferralDocx } from "../src/lib/referral-parser";
import { importClientDocumentsFromFolderDetailed } from "../src/lib/client-document-import";
import { prisma } from "../src/lib/prisma";
import { extractPdfText } from "../src/lib/pdf-text";
import mammoth from "mammoth";

const claim = process.argv[2];
if (!claim) {
  console.error("Usage: npx tsx scripts/debug-client-folder.ts <CLAIM>");
  process.exit(1);
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { email: "ghim@gvcounseling.com" } });
  if (!admin) throw new Error("Admin not found");
  const token = await getValidGoogleAccessToken(admin.id);
  const { folders } = await scanDriveClientFolders(admin.id);
  const folder = folders.find((f) => f.folderName.startsWith(`${claim} `));
  if (!folder) throw new Error(`Folder not found: ${claim}`);

  console.log("Folder:", folder.folderName, folder.folderId);
  const files = await listClientFolderFiles(token, folder.folderId);
  console.log("\nFiles:");
  for (const f of files) {
    console.log(`  ${f.name} (${f.mimeType})`);
  }

  const refFile = await findReferralSubmissionFile(token, folder.folderId);
  if (refFile) {
    console.log("\nReferral file:", refFile.name);
    try {
      const ref = await parseReferralDocx(await downloadReferralDocx(token, refFile));
      console.log("Referral parsed:", JSON.stringify(ref, null, 2));
    } catch (e) {
      console.log("Referral parse error:", e);
    }
  } else {
    console.log("\nNo referral file found");
  }

  const { parts, merged } = await importClientDocumentsFromFolderDetailed(token, folder.folderId);
  console.log("\nDocument parts:", parts.length);
  for (const p of parts) {
    console.log(`  [${p.kind}] ${p.fileName}:`, JSON.stringify(p, null, 2).slice(0, 800));
  }
  console.log("\nMerged supplement:", JSON.stringify(merged, null, 2));

  const cacFiles = files.filter(
    (f) =>
      (/pdf|word|document/i.test(f.mimeType) || f.name.endsWith(".pdf") || f.name.endsWith(".docx")) &&
      /cac|address|contact|claim status|claim &/i.test(f.name),
  );
  for (const f of cacFiles) {
    const buffer = await downloadFileBuffer(token, f);
    let text = "";
    if (f.mimeType.includes("word") || f.name.endsWith(".docx")) {
      text = (await mammoth.extractRawText({ buffer })).value;
    } else {
      text = (await extractPdfText(buffer)).text;
    }
    console.log(`\n--- CAC text: ${f.name} (${text.length} chars) ---`);
    console.log(text.slice(0, 3000));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
