/**
 * Smoke: validateEdi999 accepts clean 999 and rejects REF*G2 failure samples.
 */
import { readFileSync } from "fs";
import path from "path";
import { validateEdi999 } from "../src/lib/parse-edi-999";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

const uploads = path.join(
  process.env.HOME ?? "/home/ubuntu",
  ".cursor/projects/workspace/uploads",
);

const acceptedPath = path.join(uploads, "EDI-999-Acknowledgement-0479998-1_848d.txt");
const rejectedPath = path.join(uploads, "EDI-999-Acknowledgement-0479998-1_5cff.txt");

const accepted = validateEdi999(readFileSync(acceptedPath, "utf8"));
if (!accepted.accepted) fail(`expected accepted 999, got: ${accepted.summary}`);
if (accepted.transactionSetStatus !== "A") fail("IK5 should be A");
if (accepted.functionalGroupStatus !== "A") fail("AK9 should be A");
if (accepted.segmentErrorCount !== 0) fail("accepted 999 should have 0 segment errors");
console.log("OK: accepted 999");

const rejected = validateEdi999(readFileSync(rejectedPath, "utf8"));
if (rejected.accepted) fail(`expected rejected 999, got: ${rejected.summary}`);
if (rejected.transactionSetStatus !== "R") fail("IK5 should be R");
if (rejected.transactionSetsAccepted !== 0) fail("accepted count should be 0");
if (rejected.segmentErrorCount !== 10) {
  fail(`expected 10 REF segment errors, got ${rejected.segmentErrorCount}`);
}
if (!rejected.knownIssueHints.some((hint) => /REF\*G2/i.test(hint))) {
  fail("expected REF*G2 known-issue hint");
}
console.log("OK: rejected REF*G2 999");

console.log("All 999 validation checks passed.");
