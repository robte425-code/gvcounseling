import dotenv from "dotenv";

dotenv.config({ path: ".env.vercel.test" });

import { generateLniFaxCoverPdf } from "../src/lib/lni-fax-cover";
import { sendFax } from "../src/lib/faxage";

async function main() {
  const cover = await generateLniFaxCoverPdf({
    claimNumber: "TEST123",
    clientName: "Test, Client",
    providerName: "Test Therapist",
    serviceDatesPhrase: "Jul 5, 2026",
  });

  const result = await sendFax({
    faxno: "2064790710",
    recipname: "[TEST] L&I TEST123",
    filenames: ["cover-TEST123.pdf"],
    fileDataBase64: [Buffer.from(cover).toString("base64")],
  });

  console.log("Result:", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
