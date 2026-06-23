/**
 * Import all Drive client folders and verify each.
 * Usage: npx tsx scripts/import-all-clients.ts [--retry-failures]
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { writeFileSync } from "fs";
import { importAndVerifyClaim } from "./import-and-verify-client";
import { scanDriveClientFolders } from "../src/lib/drive-client-import";
import { prisma } from "../src/lib/prisma";

const RESULTS_PATH = "scripts/import-all-results.json";

type Result = Awaited<ReturnType<typeof importAndVerifyClaim>>;

async function main() {
  const retryOnly = process.argv.includes("--retry-failures");
  const admin = await prisma.user.findFirst({ where: { email: "ghim@gvcounseling.com" } });
  if (!admin) throw new Error("Admin not found");

  const { folders, errors: scanErrors } = await scanDriveClientFolders(admin.id);
  let claims = folders
    .map((f) => f.folderName.split(" - ")[0]?.trim())
    .filter((c): c is string => !!c);

  if (retryOnly) {
    try {
      const prev = JSON.parse(
        await import("fs").then((fs) => fs.readFileSync(RESULTS_PATH, "utf8")),
      ) as { results: Result[] };
      const failed = new Set(prev.results.filter((r) => !r.pass).map((r) => r.claim));
      claims = claims.filter((c) => failed.has(c));
      console.log(`Retrying ${claims.length} failed claims`);
    } catch {
      console.error("No prior results at", RESULTS_PATH);
      process.exit(1);
    }
  }

  const results: Result[] = [];
  let pass = 0;
  let fail = 0;

  for (let i = 0; i < claims.length; i++) {
    const claim = claims[i]!;
    process.stdout.write(`[${i + 1}/${claims.length}] ${claim} ... `);
    try {
      const r = await importAndVerifyClaim(claim);
      results.push(r);
      if (r.pass) {
        pass++;
        console.log("PASS");
      } else {
        fail++;
        console.log("FAIL", r.issues.join("; "));
      }
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ claim, pass: false, issues: [msg] });
      console.log("ERROR", msg);
    }
  }

  const summary = {
    at: new Date().toISOString(),
    total: claims.length,
    pass,
    fail,
    scanErrors,
    results,
  };

  writeFileSync(RESULTS_PATH, JSON.stringify(summary, null, 2));
  console.log(`\nDone: ${pass} pass, ${fail} fail (${claims.length} total)`);
  console.log("Results:", RESULTS_PATH);

  if (fail > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((x) => !x.pass)) {
      console.log(`  ${r.claim}: ${r.issues.join("; ")}`);
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
