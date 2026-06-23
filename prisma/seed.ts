import { createPrismaClient } from "../src/lib/prisma";
import { hashPassword, generateOneTimePassword } from "../src/lib/password";

const prisma = createPrismaClient();

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? generateOneTimePassword();
  const mariaPassword = process.env.SEED_MARIA_PASSWORD ?? generateOneTimePassword();
  const stevenPassword = process.env.SEED_STEVEN_PASSWORD ?? generateOneTimePassword();

  await prisma.user.upsert({
    where: { email: "ghim@gvcounseling.com" },
    update: {},
    create: {
      email: "ghim@gvcounseling.com",
      firstName: "Robert",
      lastName: "Evans",
      role: "ADMIN",
      passwordHash: await hashPassword(adminPassword),
      mustChangePassword: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "maria@gvcounseling.com" },
    update: {},
    create: {
      email: "maria@gvcounseling.com",
      firstName: "Maria Belen",
      lastName: "Castro",
      role: "THERAPIST",
      lniProviderId: "480003",
      npi: "1619499308",
      passwordHash: await hashPassword(mariaPassword),
      mustChangePassword: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "steven@gvcounseling.com" },
    update: {},
    create: {
      email: "steven@gvcounseling.com",
      firstName: "Steven",
      lastName: "Sample",
      role: "THERAPIST",
      lniProviderId: "497007",
      npi: "1821362963",
      passwordHash: await hashPassword(stevenPassword),
      mustChangePassword: true,
    },
  });

  console.log("\n=== Grandview Counseling portal seed ===\n");
  console.log("Admin:    ghim@gvcounseling.com");
  console.log("Password:", adminPassword);
  console.log("\nMaria:    maria@gvcounseling.com");
  console.log("Password:", mariaPassword);
  console.log("\nSteven:   steven@gvcounseling.com");
  console.log("Password:", stevenPassword);
  console.log("\nAll users must change password on first login.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
