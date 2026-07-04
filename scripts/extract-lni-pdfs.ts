import { createRequire } from "module";
import { writeFileSync, readFileSync } from "fs";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse");

async function extract(path: string): Promise<string> {
  const buf = readFileSync(path);
  const parser = new PDFParse({ data: buf });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

async function main() {
  const companion = await extract("/tmp/lni-docs/1EADgg88tUVwyrTQalQl2sQYrKvdfrOKo.pdf");
  writeFileSync("/tmp/lni-docs/companion-guide.txt", companion);
  console.log("Companion guide chars:", companion.length);

  const peb = await extract("/tmp/lni-docs/1t3hXXCMh8Fh8ULsQ-jayammP5Zw7E-W1.pdf");
  writeFileSync("/tmp/lni-docs/peb-guide.txt", peb);
  console.log("PEB guide chars:", peb.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
