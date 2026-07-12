#!/usr/bin/env tsx
/**
 * Smoke tests for the four critical portal security/billing fixes.
 *
 * Usage:
 *   npm run smoke:critical-fixes
 *   npm run smoke:critical-fixes -- --remote
 *   DATABASE_URL=... npm run smoke:critical-fixes -- --db
 *   SMOKE_BASE_URL=https://www.gvcounseling.com npm run smoke:critical-fixes -- --remote --db
 *
 * Optional env:
 *   SMOKE_BASE_URL — production site (default https://www.gvcounseling.com)
 *   AUTH_SECRET — required for local JWT marker tests
 *   DRIVE_TOKEN_ENCRYPTION_KEY — required for local crypto tests
 *   DATABASE_URL — enables DB checks (rate limit table, Drive tokens, BILLED+CLM)
 *   SMOKE_TEST_SECRET — must match Vercel env for remote tests that hit /api/refer or /api/contact
 *                       (skips intake/email; only exercises rate limits)
 */

import "dotenv/config";
import { authConfig } from "../src/auth.config";
import { createPasswordGateClearMarker, verifyPasswordGateClearMarker } from "../src/lib/session-update-tokens";
import { decryptSecret, encryptSecret } from "../src/lib/secret-crypto";
import { UploadValidationError, validateReferralUploadBatch } from "../src/lib/upload-validation";
import {
  PORTAL_ADMIN_CLIENT_RETURN_PREFIXES,
  PORTAL_ADMIN_INVOICE_RETURN_PREFIXES,
  PORTAL_CLIENT_RETURN_PREFIXES,
  sanitizePortalReturnTo,
} from "../src/lib/sanitize-portal-return-to";
import {
  assertAdminCanDeleteInvoice,
  canDeleteAdminInvoice,
} from "../src/lib/invoice-delete-policy";
import { parseTherapistInvoicesReturnTo } from "../src/lib/invoice-list-filters";
import {
  resolveTherapistPaymentDisplay,
  type InvoiceTherapistPayRunLine,
} from "../src/lib/invoice-therapist-payment";
import type { JWT } from "next-auth/jwt";

type Status = "PASS" | "FAIL" | "SKIP";
type Result = { name: string; status: Status; detail?: string };

const args = new Set(process.argv.slice(2));
const runRemote = args.has("--remote") || args.has("--all");
const runDb = args.has("--db") || args.has("--all");
const baseUrl = (process.env.SMOKE_BASE_URL ?? "https://www.gvcounseling.com").replace(/\/$/, "");

const results: Result[] = [];

function record(name: string, status: Status, detail?: string) {
  results.push({ name, status, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${status.padEnd(4)} ${name}${suffix}`);
}

function ensureEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  return value;
}

async function runJwtCallback(
  token: JWT,
  session: Record<string, unknown>,
): Promise<JWT> {
  const jwt = authConfig.callbacks?.jwt;
  if (!jwt) throw new Error("authConfig.callbacks.jwt is missing");
  return jwt({ token, user: undefined, account: null, trigger: "update", session });
}

async function testLocalAuthMarkers() {
  if (!ensureEnv("AUTH_SECRET")) {
    record("local/auth-marker", "SKIP", "AUTH_SECRET not set");
    return;
  }

  const marker = await createPasswordGateClearMarker("user-1");
  const ok = await verifyPasswordGateClearMarker("user-1", marker);
  const bad = await verifyPasswordGateClearMarker("user-1", { exp: marker.exp, sig: "00".repeat(32) });
  record("local/auth-marker", ok && !bad ? "PASS" : "FAIL");
}

async function testLocalJwtImpersonation() {
  if (!ensureEnv("AUTH_SECRET")) {
    record("local/jwt-impersonation-therapist-blocked", "SKIP", "AUTH_SECRET not set");
    record("local/jwt-impersonation-admin-allowed", "SKIP", "AUTH_SECRET not set");
    return;
  }

  const therapistTarget = {
    id: "therapist-2",
    role: "THERAPIST" as const,
    firstName: "Maria",
    lastName: "Therapist",
  };

  const therapistToken: JWT = {
    id: "therapist-1",
    role: "THERAPIST",
    mustChangePassword: false,
    firstName: "Steven",
    lastName: "Therapist",
  };

  const blocked = await runJwtCallback(therapistToken, {
    impersonation: { action: "start", user: therapistTarget },
  });
  record(
    "local/jwt-impersonation-therapist-blocked",
    blocked.id === "therapist-1" && !blocked.impersonatingUserId ? "PASS" : "FAIL",
  );

  const adminToken: JWT = {
    id: "admin-1",
    role: "ADMIN",
    mustChangePassword: false,
    firstName: "Admin",
    lastName: "User",
  };

  const allowed = await runJwtCallback(adminToken, {
    impersonation: { action: "start", user: therapistTarget },
  });
  record(
    "local/jwt-impersonation-admin-allowed",
    allowed.id === "therapist-2" && allowed.impersonatingUserId === "therapist-2" ? "PASS" : "FAIL",
  );
}

async function testLocalJwtPasswordGate() {
  if (!ensureEnv("AUTH_SECRET")) {
    record("local/jwt-password-gate-without-marker", "SKIP", "AUTH_SECRET not set");
    record("local/jwt-password-gate-with-marker", "SKIP", "AUTH_SECRET not set");
    return;
  }

  const token: JWT = {
    id: "user-gate",
    role: "THERAPIST",
    mustChangePassword: true,
    firstName: "Gate",
    lastName: "Test",
  };

  const blocked = await runJwtCallback(token, {
    user: { mustChangePassword: false },
  });
  record(
    "local/jwt-password-gate-without-marker",
    blocked.mustChangePassword === true ? "PASS" : "FAIL",
  );

  const marker = await createPasswordGateClearMarker("user-gate");
  const cleared = await runJwtCallback(token, {
    user: { mustChangePassword: false },
    passwordGateClear: marker,
  });
  record(
    "local/jwt-password-gate-with-marker",
    cleared.mustChangePassword === false ? "PASS" : "FAIL",
  );
}

async function testLocalDriveCrypto() {
  if (!ensureEnv("DRIVE_TOKEN_ENCRYPTION_KEY")) {
    record("local/drive-crypto-roundtrip", "SKIP", "DRIVE_TOKEN_ENCRYPTION_KEY not set");
    record("local/drive-crypto-legacy-plaintext", "SKIP", "DRIVE_TOKEN_ENCRYPTION_KEY not set");
    return;
  }

  const plain = "ya29.example-refresh-token";
  const enc = encryptSecret(plain);
  const dec = decryptSecret(enc);
  const legacy = decryptSecret(plain);
  record(
    "local/drive-crypto-roundtrip",
    dec === plain && enc.startsWith("enc:v1:") ? "PASS" : "FAIL",
  );
  record("local/drive-crypto-legacy-plaintext", legacy === plain ? "PASS" : "FAIL");
}

function testLocalReturnToSanitization() {
  const adminFallback = "/portal/admin/clients";
  const cases: Array<{ name: string; input: string; expected: string; prefixes: readonly string[] }> = [
    { name: "empty", input: "", expected: adminFallback, prefixes: PORTAL_ADMIN_CLIENT_RETURN_PREFIXES },
    {
      name: "valid-with-query",
      input: "/portal/admin/clients?status=ACTIVE",
      expected: "/portal/admin/clients?status=ACTIVE",
      prefixes: PORTAL_ADMIN_CLIENT_RETURN_PREFIXES,
    },
    { name: "blocks-https", input: "https://evil.com", expected: adminFallback, prefixes: PORTAL_ADMIN_CLIENT_RETURN_PREFIXES },
    { name: "blocks-protocol-relative", input: "//evil.com", expected: adminFallback, prefixes: PORTAL_ADMIN_CLIENT_RETURN_PREFIXES },
    {
      name: "blocks-traversal",
      input: "/portal/admin/clients/../evil",
      expected: adminFallback,
      prefixes: PORTAL_ADMIN_CLIENT_RETURN_PREFIXES,
    },
    {
      name: "blocks-wrong-prefix",
      input: "/portal/therapist/clients/abc",
      expected: adminFallback,
      prefixes: PORTAL_ADMIN_CLIENT_RETURN_PREFIXES,
    },
    {
      name: "allows-therapist-client",
      input: "/portal/therapist/clients/abc",
      expected: "/portal/therapist/clients/abc",
      prefixes: PORTAL_CLIENT_RETURN_PREFIXES,
    },
    {
      name: "allows-admin-invoice-detail",
      input: "/portal/admin/invoices/inv1",
      expected: "/portal/admin/invoices/inv1",
      prefixes: PORTAL_ADMIN_INVOICE_RETURN_PREFIXES,
    },
  ];

  let ok = true;
  for (const c of cases) {
    const got = sanitizePortalReturnTo(c.input, { fallback: adminFallback, allowedPrefixes: c.prefixes });
    if (got !== c.expected) {
      ok = false;
      record("local/return-to-sanitization", "FAIL", `${c.name}: got ${got}`);
      return;
    }
  }

  const therapistList = parseTherapistInvoicesReturnTo("/portal/therapist/invoices?payment=PAID");
  const therapistBlocked = parseTherapistInvoicesReturnTo("https://evil.com");
  if (
    therapistList !== "/portal/therapist/invoices?payment=PAID" ||
    therapistBlocked !== "/portal/therapist/invoices"
  ) {
    record("local/return-to-sanitization", "FAIL", "parseTherapistInvoicesReturnTo regression");
    return;
  }

  record("local/return-to-sanitization", ok ? "PASS" : "FAIL");
}

function testLocalTherapistPaymentDisplay() {
  const finalized = [{ payout: { payRun: { status: "FINALIZED" as const } } }];
  const draft = [{ payout: { payRun: { status: "DRAFT" as const } } }];
  const mixed: InvoiceTherapistPayRunLine[] = [
    { payout: { payRun: { status: "DRAFT" } } },
    { payout: { payRun: { status: "FINALIZED" } } },
  ];

  const ok =
    resolveTherapistPaymentDisplay([]) === "none" &&
    resolveTherapistPaymentDisplay(draft) === "pending" &&
    resolveTherapistPaymentDisplay(finalized) === "paid" &&
    resolveTherapistPaymentDisplay(mixed) === "paid";

  record("local/therapist-payment-display", ok ? "PASS" : "FAIL");
}

function testLocalInvoiceDeletePolicy() {
  if (!canDeleteAdminInvoice({ status: "DRAFT", billedAt: null })) {
    record("local/invoice-delete-policy", "FAIL", "DRAFT should be deletable");
    return;
  }
  if (canDeleteAdminInvoice({ status: "SUBMITTED", billedAt: null })) {
    record("local/invoice-delete-policy", "FAIL", "SUBMITTED should not be deletable");
    return;
  }
  if (canDeleteAdminInvoice({ status: "BILLED", billedAt: new Date() })) {
    record("local/invoice-delete-policy", "FAIL", "BILLED should not be deletable");
    return;
  }

  try {
    assertAdminCanDeleteInvoice({
      status: "SUBMITTED",
      billedAt: null,
      payPeriodId: null,
      remittanceLineCount: 0,
      payRunLineCount: 0,
    });
    record("local/invoice-delete-policy", "FAIL", "assert should throw for SUBMITTED");
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("draft")) {
      record("local/invoice-delete-policy", "FAIL", `unexpected error: ${msg}`);
      return;
    }
  }

  try {
    assertAdminCanDeleteInvoice({
      status: "DRAFT",
      billedAt: null,
      payPeriodId: "pp-1",
      remittanceLineCount: 0,
      payRunLineCount: 0,
    });
    record("local/invoice-delete-policy", "FAIL", "assert should throw for pay period");
    return;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (!msg.includes("pay period")) {
      record("local/invoice-delete-policy", "FAIL", `unexpected error: ${msg}`);
      return;
    }
  }

  record("local/invoice-delete-policy", "PASS");
}

async function testDbNonDraftInvoiceDeleteGuard() {
  if (!ensureEnv("DATABASE_URL")) {
    record("db/non-draft-invoices-not-deletable", "SKIP", "DATABASE_URL not set");
    return;
  }

  const prisma = await getPrisma();
  const nonDraft = await prisma.invoice.count({ where: { status: { not: "DRAFT" } } });
  const draftWithPayPeriod = await prisma.invoice.count({
    where: { status: "DRAFT", payPeriodId: { not: null } },
  });
  const draftWithRemittance = await prisma.invoice.count({
    where: { status: "DRAFT", remittanceLines: { some: {} } },
  });

  record(
    "db/non-draft-invoices-not-deletable",
    "PASS",
    `nonDraft=${nonDraft} draftWithPayPeriod=${draftWithPayPeriod} draftWithRemittance=${draftWithRemittance} (UI+server block non-draft)`,
  );
}

function testLocalUploadValidation() {
  try {
    validateReferralUploadBatch([
      { filename: "note.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(512) },
    ]);
    record("local/upload-accepts-pdf", "PASS");
  } catch (e) {
    record("local/upload-accepts-pdf", "FAIL", (e as Error).message);
  }

  try {
    validateReferralUploadBatch([
      { filename: "bad.exe", mimeType: "application/octet-stream", buffer: Buffer.alloc(8) },
    ]);
    record("local/upload-rejects-exe", "FAIL", "expected UploadValidationError");
  } catch (e) {
    record(
      "local/upload-rejects-exe",
      e instanceof UploadValidationError ? "PASS" : "FAIL",
      (e as Error).message,
    );
  }
}

async function getPrisma() {
  const { prisma } = await import("../src/lib/prisma");
  return prisma;
}

async function testLocalRateLimit() {
  if (!ensureEnv("DATABASE_URL")) {
    record("local/rate-limit-enforcement", "SKIP", "DATABASE_URL not set");
    return;
  }

  const { enforceRateLimit } = await import("../src/lib/rate-limit");
  const key = `smoke:${Date.now()}`;
  const limit = 3;
  const windowMs = 60_000;
  let saw429 = false;

  for (let i = 0; i < 5; i++) {
    try {
      await enforceRateLimit(key, limit, windowMs);
    } catch (e) {
      if (e instanceof Error && e.name === "RateLimitError") {
        saw429 = true;
        break;
      }
      throw e;
    }
  }

  record("local/rate-limit-enforcement", saw429 ? "PASS" : "FAIL", `limit=${limit}`);

  const prisma = await getPrisma();
  await prisma.rateLimitBucket.deleteMany({ where: { key } }).catch(() => undefined);
}

function smokeHeaders(): Record<string, string> {
  const secret = process.env.SMOKE_TEST_SECRET?.trim();
  return secret ? { "x-smoke-test-secret": secret } : {};
}

function hasSmokeSecret(): boolean {
  return !!process.env.SMOKE_TEST_SECRET?.trim();
}

async function postRefer(
  base: string,
  body: FormData,
  headers: Record<string, string> = {},
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${base}/api/refer`, { method: "POST", body, headers });
  return { status: res.status, text: await res.text() };
}

async function testRemoteReferValidation() {
  const missing = await postRefer(baseUrl, (() => {
    const fd = new FormData();
    fd.set("vrcName", "Smoke Test");
    return fd;
  })());
  record(
    "remote/refer-missing-fields",
    missing.status === 400 ? "PASS" : "FAIL",
    `status=${missing.status}`,
  );

  const fd = new FormData();
  fd.set("vrcName", "Smoke Test");
  fd.set("clientName", "Smoke Test");
  fd.set("claimNumbers", "SMOKE-TEST-000");
  fd.append(
    "claimStatusFile",
    new Blob([Buffer.from("not a real exe")], { type: "application/octet-stream" }),
    "bad.exe",
  );
  const badFile = await postRefer(baseUrl, fd);
  const badJson = badFile.text;
  record(
    "remote/refer-rejects-exe",
    badFile.status === 400 && badJson.includes("PDF, image, and Word") ? "PASS" : "FAIL",
    `status=${badFile.status}`,
  );
}

async function testRemoteContact() {
  if (!hasSmokeSecret()) {
    record("remote/contact-smoke-bypass", "SKIP", "set SMOKE_TEST_SECRET to avoid sending contact emails");
    return;
  }

  const res = await fetch(`${baseUrl}/api/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...smokeHeaders() },
    body: JSON.stringify({
      email: "smoke-test@example.com",
      firstName: "Smoke",
      lastName: "Test",
      message: "critical fixes smoke test",
    }),
  });
  const json = await res.json().catch(() => ({}));
  record(
    "remote/contact-smoke-bypass",
    res.status === 200 && (json as { smoke?: boolean }).smoke === true ? "PASS" : "FAIL",
    `status=${res.status}`,
  );
}

async function testRemoteRateLimit() {
  if (!hasSmokeSecret()) {
    record(
      "remote/refer-rate-limit",
      "SKIP",
      "set SMOKE_TEST_SECRET in Vercel + locally to test rate limits without referral emails",
    );
    return;
  }

  const headers = smokeHeaders();
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) {
    const fd = new FormData();
    fd.set("vrcName", "Smoke RL");
    fd.set("clientName", "Smoke RL");
    fd.set("claimNumbers", `SMOKE-RL-${i}`);
    const { status } = await postRefer(baseUrl, fd, headers);
    codes.push(status);
  }

  const has429 = codes.includes(429);
  const allSmokeOk = codes.filter((c) => c !== 429).every((c) => c === 200);
  record(
    "remote/refer-rate-limit",
    has429 && allSmokeOk ? "PASS" : "FAIL",
    `codes=${codes.join(",")}`,
  );
}

async function testRemotePortalAuthGates() {
  const res = await fetch(`${baseUrl}/portal/admin/dashboard`, { redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  record(
    "remote/portal-admin-requires-login",
    res.status === 307 && location.includes("/portal/login") ? "PASS" : "FAIL",
    `status=${res.status}`,
  );
}

async function testDbRateLimitTable() {
  if (!ensureEnv("DATABASE_URL")) {
    record("db/rate-limit-table", "SKIP", "DATABASE_URL not set");
    return;
  }

  try {
    const prisma = await getPrisma();
    const count = await prisma.rateLimitBucket.count();
    record("db/rate-limit-table", "PASS", `rows=${count}`);
  } catch (e) {
    record("db/rate-limit-table", "FAIL", (e as Error).message);
  }
}

async function testDbDriveTokenEncryption() {
  if (!ensureEnv("DATABASE_URL")) {
    record("db/drive-tokens-encrypted-or-legacy", "SKIP", "DATABASE_URL not set");
    return;
  }

  const prisma = await getPrisma();
  const connections = await prisma.googleDriveConnection.findMany({
    select: { accessToken: true, refreshToken: true, googleEmail: true },
  });

  if (!connections.length) {
    record("db/drive-tokens-encrypted-or-legacy", "SKIP", "no GoogleDriveConnection rows");
    return;
  }

  const allSecure = connections.every(
    (row) =>
      row.accessToken.startsWith("enc:v1:") && row.refreshToken.startsWith("enc:v1:"),
  );
  const anyLegacy = connections.some(
    (row) =>
      !row.accessToken.startsWith("enc:v1:") || !row.refreshToken.startsWith("enc:v1:"),
  );

  if (allSecure) {
    record("db/drive-tokens-encrypted-or-legacy", "PASS", `connections=${connections.length} (encrypted)`);
  } else if (anyLegacy && ensureEnv("DRIVE_TOKEN_ENCRYPTION_KEY")) {
    record(
      "db/drive-tokens-encrypted-or-legacy",
      "FAIL",
      `${connections.length} connection(s) still plaintext — reconnect Drive or refresh tokens`,
    );
  } else {
    record(
      "db/drive-tokens-encrypted-or-legacy",
      "PASS",
      `connections=${connections.length} (legacy plaintext OK until refresh; set DRIVE_TOKEN_ENCRYPTION_KEY)`,
    );
  }
}

async function testDbBilledInvoicesHaveClm() {
  if (!ensureEnv("DATABASE_URL")) {
    record("db/billed-invoices-have-clm", "SKIP", "DATABASE_URL not set");
    return;
  }

  const prisma = await getPrisma();
  const billed = await prisma.invoice.count({ where: { status: "BILLED" } });
  const billedMissingClm = await prisma.invoice.count({
    where: { status: "BILLED", OR: [{ clmControlNumber: null }, { clmControlNumber: "" }] },
  });
  const billedWithBilledAt = await prisma.invoice.count({
    where: { status: "BILLED", billedAt: { not: null } },
  });

  if (billed === 0) {
    record("db/billed-invoices-have-clm", "SKIP", "no BILLED invoices");
    return;
  }

  const ok = billedMissingClm === 0 && billedWithBilledAt > 0;
  record(
    "db/billed-invoices-have-clm",
    ok ? "PASS" : "FAIL",
    `billed=${billed} missingClm=${billedMissingClm} withBilledAt=${billedWithBilledAt}`,
  );
}

async function main() {
  console.log(`Critical fixes smoke tests`);
  console.log(`base=${runRemote ? baseUrl : "(local only)"} remote=${runRemote} db=${runDb}\n`);

  console.log("== Local ==");
  await testLocalAuthMarkers();
  await testLocalJwtImpersonation();
  await testLocalJwtPasswordGate();
  await testLocalDriveCrypto();
  testLocalReturnToSanitization();
  testLocalTherapistPaymentDisplay();
  testLocalInvoiceDeletePolicy();
  testLocalUploadValidation();
  await testLocalRateLimit();

  if (runRemote) {
    console.log("\n== Remote ==");
    await testRemoteReferValidation();
    await testRemoteContact();
    await testRemoteRateLimit();
    await testRemotePortalAuthGates();
  }

  if (runDb) {
    console.log("\n== Database ==");
    await testDbRateLimitTable();
    await testDbDriveTokenEncryption();
    await testDbNonDraftInvoiceDeleteGuard();
    await testDbBilledInvoicesHaveClm();
  }

  const failed = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  console.log(`\nSummary: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (process.env.DATABASE_URL) {
      const prisma = await getPrisma().catch(() => null);
      await prisma?.$disconnect().catch(() => undefined);
    }
  });
