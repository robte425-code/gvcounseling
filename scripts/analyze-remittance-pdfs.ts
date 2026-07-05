import fs from "fs";
import path from "path";
import { extractPdfText } from "../src/lib/pdf-text";

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: npx tsx scripts/analyze-remittance-pdfs.ts <pdf>...");
  process.exit(1);
}

async function main() {
  for (const file of files) {
    const buf = fs.readFileSync(file);
    const result = await extractPdfText(buf);
    const name = path.basename(file);
    const outPath = path.join(
      process.cwd(),
      "scripts",
      `remittance-extract-${name.replace(/\.pdf$/i, "")}.txt`,
    );
    fs.writeFileSync(outPath, result.text, "utf8");
    console.log(
      JSON.stringify({
        file: name,
        pages: result.pages,
        usedOcr: result.usedOcr,
        chars: result.text.length,
        outPath,
        parseError: result.parseError,
        ocrError: result.ocrError,
      }),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
