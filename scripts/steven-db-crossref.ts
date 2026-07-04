import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const STEVEN_CLAIMS = [
  "AW17192", "AY83414", "AZ48910", "BA25824", "BL00889", "BM17605", "BM35909", "BM50321",
  "BH00259", "BK75175", "BL69750", "BM08580", "BM37705", "BM49430", "BN44993", "BN69737",
  "BP24936", "ZB62154",
];

async function main() {
  const { createPrismaClient } = await import("../src/lib/prisma");
  const prisma = createPrismaClient();

  const steven = await prisma.user.findFirst({
    where: { email: "steven@gvcounseling.com" },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!steven) throw new Error("Steven not found");

  const clients = await prisma.client.findMany({
    where: { lniClaimNumber: { in: STEVEN_CLAIMS } },
    select: {
      lniClaimNumber: true,
      therapistId: true,
      assignmentStatus: true,
      firstName: true,
      lastName: true,
    },
  });

  const stevenAssigned = clients.filter((c) => c.therapistId === steven.id);
  const wrongTherapist = clients.filter((c) => c.therapistId && c.therapistId !== steven.id);
  const unassigned = clients.filter((c) => !c.therapistId);
  const missing = STEVEN_CLAIMS.filter((claim) => !clients.some((c) => c.lniClaimNumber === claim));

  console.log(JSON.stringify({
    steven,
    inDb: clients.length,
    stevenAssigned: stevenAssigned.length,
    wrongTherapist,
    unassigned,
    missing,
  }, null, 2));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
