/**
 * Seed L&I procedure code fees (MARFS rates).
 * Usage: npx tsx scripts/seed-procedure-fees.ts
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { createProcedureCodeFee, loadAllProcedureCodeFees } from "../src/lib/procedure-fees";

const FEES = [
  { code: "96156", fy2025: 182.57, fy2026: 192.09 },
  { code: "96158", fy2025: 125.41, fy2026: 131.49 },
  { code: "96159", fy2025: 43.16, fy2026: 45.16 },
  { code: "90832", fy2025: 145.83, fy2026: 153.22 },
  { code: "90834", fy2025: 192.49, fy2026: 202.95 },
  { code: "90837", fy2025: 284.65, fy2026: 297.86 },
  { code: "9919M", fy2025: 66.41, fy2026: 68.89 },
  { code: "9918M", fy2025: 53.13, fy2026: 55.11 },
  { code: "1073M", fy2025: 60.41, fy2026: 62.67 },
] as const;

async function main() {
  for (const { code, fy2025, fy2026 } of FEES) {
    await createProcedureCodeFee({
      procedureCode: code,
      amount: fy2025,
      effectiveFrom: new Date("2025-07-01T00:00:00.000Z"),
    });
    await createProcedureCodeFee({
      procedureCode: code,
      amount: fy2026,
      effectiveFrom: new Date("2026-07-01T00:00:00.000Z"),
    });
    console.log(`Saved fees for ${code}`);
  }

  const rows = await loadAllProcedureCodeFees();
  console.log(`\n${rows.length} fee rows in database:`);
  for (const row of rows) {
    console.log(
      row.procedureCode,
      Number(row.amount).toFixed(2),
      row.effectiveFrom.toISOString().slice(0, 10),
      row.effectiveTo?.toISOString().slice(0, 10) ?? "current",
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
