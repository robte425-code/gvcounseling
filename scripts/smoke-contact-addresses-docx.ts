/**
 * Smoke: Contact & Addresses .docx attending-physician parsing.
 * Ensures External Identifier lines do not hide the doctor name.
 */
import assert from "node:assert/strict";
import { parseContactAddressesDocxText } from "../src/lib/parse-contact-addresses-docx";

const sample = `
Claimant: JANE WORKER
Address:
123 MAIN ST
SEATTLE, WA 98101

Attending Physician:
External Identifier: 1234567890
SMITH JOHN A MD
Address:
456 CLINIC AVE
SEATTLE, WA 98102
Phone:
206-555-0100

Claim Manager:
DOE JANE
Primary
360-902-1234
Fax
360-902-5678

Employer: ACME WIDGETS LLC
`;

const parsed = parseContactAddressesDocxText(sample);

assert.equal(parsed.attendingDoctorName, "SMITH JOHN A MD");
assert.equal(parsed.claimManagerName, "DOE JANE");
assert.equal(parsed.claimManagerPhone, "360-902-1234");
assert.ok(parsed.employerName?.includes("ACME"));

const doctorLabel = `
Attending Doctor:
External Identifier: 999
LEE PATRICIA ARNP
Claim Manager:
HOLT CHASE
`;
const parsedDoctor = parseContactAddressesDocxText(doctorLabel);
assert.equal(parsedDoctor.attendingDoctorName, "LEE PATRICIA ARNP");
assert.equal(parsedDoctor.claimManagerName, "HOLT CHASE");

console.log("smoke-contact-addresses-docx: ok");
