import { execSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import pg from "pg";

const { Client } = pg;

/** Prisma Migrate advisory lock id (see prisma migrate docs). */
const PRISMA_MIGRATE_ADVISORY_LOCK_ID = 72707369;

const maxAttempts = 3;

/** Prisma Migrate needs a direct Postgres URL (not PgBouncer / Neon pooler). */
function resolveMigrateDatabaseUrl() {
  const explicit =
    process.env.DIRECT_DATABASE_URL ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL_UNPOOLED;
  if (explicit) return explicit;

  const pooled = process.env.DATABASE_URL;
  if (!pooled) return undefined;
  if (pooled.includes("-pooler")) {
    return pooled.replace("-pooler", "");
  }
  return pooled;
}

/** Drop idle sessions still holding Prisma's migrate advisory lock. */
async function releaseStaleMigrateLocks(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    const { rows } = await client.query(
      `
        SELECT l.pid
        FROM pg_locks l
        JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype = 'advisory'
          AND l.objid = $1
          AND l.granted = true
          AND a.pid <> pg_backend_pid()
          AND a.state = 'idle'
          AND a.state_change < now() - interval '30 seconds'
      `,
      [PRISMA_MIGRATE_ADVISORY_LOCK_ID],
    );

    for (const { pid } of rows) {
      console.warn(`Terminating stale migrate lock holder pid=${pid}`);
      await client.query("SELECT pg_terminate_backend($1)", [pid]);
    }
  } finally {
    await client.end();
  }
}

const migrateDatabaseUrl = resolveMigrateDatabaseUrl();
if (!migrateDatabaseUrl) {
  console.error("DATABASE_URL is not set for prisma migrate deploy");
  process.exit(1);
}

if (migrateDatabaseUrl !== process.env.DATABASE_URL) {
  console.log("Using direct database URL for prisma migrate deploy");
}

const env = {
  ...process.env,
  DATABASE_URL: migrateDatabaseUrl,
};

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    await releaseStaleMigrateLocks(migrateDatabaseUrl);
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
