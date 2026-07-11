/**
 * Manually update specific client fields.
 * Usage: npx tsx scripts/update-client-fields.ts BD66985 diagnoses=S83.91XA,M17.11 attendingDoctorName="LENSON TINA"
 */
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

async function main() {
  const claim = process.argv[2]?.trim().toUpperCase();
  if (!claim) {
    console.error("Usage: npx tsx scripts/update-client-fields.ts <CLAIM> field=value ...");
    process.exit(1);
  }

  const { prisma } = await import("../src/lib/prisma");
  const client = await prisma.client.findUnique({ where: { lniClaimNumber: claim } });
  if (!client) throw new Error(`Client not found: ${claim}`);

  const data: Record<string, unknown> = {};
  for (const arg of process.argv.slice(3)) {
    const eq = arg.indexOf("=");
    if (eq <= 0) continue;
    const key = arg.slice(0, eq);
    let value = arg.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key === "diagnoses") {
      data.diagnoses = value.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
    } else {
      data[key] = value || null;
    }
  }

  if (!Object.keys(data).length) {
    throw new Error("No fields to update.");
  }

  const updated = await prisma.client.update({
    where: { id: client.id },
    data,
    select: {
      lniClaimNumber: true,
      firstName: true,
      lastName: true,
      attendingDoctorName: true,
      diagnoses: true,
    },
  });

  console.log("Updated", updated.lniClaimNumber, JSON.stringify(updated, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
