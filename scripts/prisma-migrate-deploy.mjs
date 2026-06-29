import { execSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";

const maxAttempts = 3;
const env = {
  ...process.env,
  PRISMA_MIGRATE_ADVISORY_LOCK_TIMEOUT:
    process.env.PRISMA_MIGRATE_ADVISORY_LOCK_TIMEOUT ?? "60000",
};

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "inherit", env });
    process.exit(0);
  } catch {
    if (attempt === maxAttempts) {
      console.error(`prisma migrate deploy failed after ${maxAttempts} attempts`);
      process.exit(1);
    }
    const waitMs = 5000 * attempt;
    console.warn(`Migrate attempt ${attempt} failed; retrying in ${waitMs / 1000}s…`);
    await setTimeout(waitMs);
  }
}
