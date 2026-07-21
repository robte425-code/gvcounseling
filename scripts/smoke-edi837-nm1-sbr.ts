/**
 * Regression: L&I 999 rejected production 837s because NM1 ID qualifier/ID and
 * SBR claim-filing indicator were shifted one element left (missing empty NM107 / SBR08).
 * Assert correct X12 element positions after buildEdi837.
 */
import { buildEdi837, type Edi837Claim } from "../src/lib/edi837";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

function assertIncludes(content: string, needle: string, label: string) {
  if (!content.includes(needle)) {
    fail(`${label}: expected to find ${JSON.stringify(needle)}`);
  }
  console.log(`OK: ${label}`);
}

function elementsOf(segment: string): string[] {
  return segment.replace(/~$/, "").split("*");
}

function findSegment(content: string, prefix: string): string {
  const segments = content.split("~").filter(Boolean);
  const hit = segments.find((s) => s === prefix || s.startsWith(`${prefix}*`));
  if (!hit) fail(`missing segment starting with ${prefix}`);
  return hit;
}

const claim: Edi837Claim = {
  clmControlNumber: "TESTCLM001",
  client: {
    claimNumber: "AB12345",
    lastName: "Doe",
    firstName: "Jane",
    addressLine1: "123 Main St",
    city: "Seattle",
    state: "WA",
    zip: "98101",
    dateOfBirth: new Date("1990-01-15T00:00:00Z"),
    gender: "F",
    dateOfInjury: new Date("2026-06-01T00:00:00Z"),
    primaryDiagnosis: "F43.10",
    additionalDiagnoses: [],
  },
  therapist: {
    lastName: "Smith",
    firstName: "Pat",
    lniProviderId: "1234567",
    npi: "1619499308",
  },
  lines: [
    {
      procedureCode: "90834",
      amount: 150,
      serviceDate: new Date("2026-07-02T00:00:00Z"),
      units: 1,
    },
  ],
};

const { content } = buildEdi837([claim], {
  now: new Date("2026-07-17T12:00:00Z"),
  usageIndicator: "P",
});

// Org submitter: NM108=46, NM109=provider id (NM104–NM107 empty → ***** between name and 46)
assertIncludes(content, "NM1*41*2*GRANDVIEW COUNSELING*****46*0479998~", "NM1*41 element layout");

// Receiver: NM108=46
assertIncludes(
  content,
  "NM1*40*2*WASHINGTON STATE DEPT OF LABOR & INDUSTRIES*****46*916001069~",
  "NM1*40 element layout",
);

// Billing provider: NM108=XX, NM109=NPI
assertIncludes(content, "NM1*85*2*GRANDVIEW COUNSELING*****XX*1568247872~", "NM1*85 element layout");

// Subscriber: SBR09=WC (SBR04–SBR08 empty → ****** between claim and WC)
assertIncludes(content, "SBR*P*18*AB12345******WC~", "SBR claim filing indicator in SBR09");

// Patient: NM108=MI, NM109=claim (NM105–NM107 empty → **** between first and MI)
assertIncludes(content, "NM1*IL*1*DOE*JANE****MI*AB12345~", "NM1*IL element layout");

// Payer: NM108=PI
assertIncludes(
  content,
  "NM1*PR*2*WASHINGTON STATE DEPT OF LABOR & INDUSTRIES*****PI*916001069~",
  "NM1*PR element layout",
);

// Rendering provider: NM108=XX
assertIncludes(content, "NM1*82*1*SMITH*PAT****XX*1619499308~", "NM1*82 element layout");

// L&I 999 rejects REF*G2 in loop 2310 when NM1*82 already has NPI (IK4 I12).
if (content.includes("REF*G2*1234567~")) {
  fail("REF*G2 for rendering provider must not be emitted when NPI is present");
}
console.log("OK: no rendering-provider REF*G2");

// Payer secondary ID REF*G2 (org payee) is still allowed.
assertIncludes(content, "REF*G2*0479998~", "payer/payee REF*G2 present");

// Structural checks via element indices (1-based X12 positions)
const nm41 = elementsOf(findSegment(content, "NM1*41"));
if (nm41[7] !== "" || nm41[8] !== "46" || nm41[9] !== "0479998") {
  fail(`NM1*41 indices wrong: ${JSON.stringify(nm41)}`);
}

const sbr = elementsOf(findSegment(content, "SBR"));
if (sbr[8] !== "" || sbr[9] !== "WC") {
  fail(`SBR indices wrong: ${JSON.stringify(sbr)}`);
}

const nmIl = elementsOf(findSegment(content, "NM1*IL"));
if (nmIl[7] !== "" || nmIl[8] !== "MI" || nmIl[9] !== "AB12345") {
  fail(`NM1*IL indices wrong: ${JSON.stringify(nmIl)}`);
}

console.log("All NM1/SBR element-position checks passed.");
