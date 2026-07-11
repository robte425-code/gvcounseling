import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });

async function main() {
  const { getSystemDriveAccessToken } = await import("../src/lib/google-drive-system");
  const { downloadLniRemittancePdf, listLniRemittanceAdvicePdfs } = await import(
    "../src/lib/lni-remittance-drive"
  );
  const { parseLniRemittancePdf } = await import("../src/lib/parse-lni-remittance-pdf");
  const { extractRemittancePdfText } = await import("../src/lib/pdf-text");
  const { accessToken } = await getSystemDriveAccessToken();
  const files = await listLniRemittanceAdvicePdfs(accessToken);
  const file = files.find((f) => f.name === "RemittanceAdvice_0479998_772026.pdf");
  if (!file) throw new Error("file not found");

  const buf = await downloadLniRemittancePdf(accessToken, file);
  const text = await extractRemittancePdfText(buf);
  const idx = text.text.indexOf("BL44101");
  if (idx >= 0) {
    console.log("\n=== Raw text around first BL44101 (1200 chars) ===");
    console.log(text.text.slice(idx, idx + 1200));
  }
  const deniedIdx = text.text.indexOf("DENIED BILLS");
  if (deniedIdx >= 0) {
    const blDenied = text.text.indexOf("BL44101", deniedIdx);
    if (blDenied >= 0) {
      console.log("\n=== Raw DENIED BL44101 (800 chars) ===");
      console.log(text.text.slice(blDenied, blDenied + 800));
    }
  }

  const parsed = await parseLniRemittancePdf(buf);

  console.log("totalPaid", parsed.totalPaid, "remittance", parsed.remittanceNumber);
  console.log("EOB 309:", parsed.eobCodeDescriptions?.["309"]);

  const bl = parsed.bills.filter((b) => b.claimNumber === "BL44101");
  console.log("\nBL44101 bills (" + bl.length + "):");
  for (const bill of bl) {
    console.log(
      JSON.stringify({
        section: bill.section,
        payable: bill.billTotalPayable,
        eobCodes: bill.eobCodes,
        serviceLines: bill.serviceLines.map((s) => ({
          code: s.procedureCode,
          from: s.serviceDateFrom,
          billed: s.billed,
          payable: s.payable,
        })),
      }),
    );
  }

  const neg = parsed.bills.filter((b) => b.billTotalPayable < 0);
  console.log("\nNegative payable bills:", neg.length);
  for (const bill of neg) {
    console.log(bill.claimNumber, bill.section, bill.billTotalPayable, bill.eobCodes);
  }

  const eob309 = parsed.bills.filter((b) => b.eobCodes.includes("309"));
  console.log("\nBills with EOB 309:", eob309.length);
  for (const bill of eob309) {
    console.log(
      bill.claimNumber,
      bill.section,
      bill.billTotalPayable,
      bill.serviceLines.map((s) => `${s.serviceDateFrom} ${s.procedureCode}`),
      bill.eobCodes,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
