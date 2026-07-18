#!/usr/bin/env tsx
/**
 * Unit checks for claim-first Drive folder matching.
 * Run: npx tsx scripts/test-find-drive-folder-for-claim.ts
 */
import assert from "node:assert/strict";
import {
  findDriveFolderForClaim,
  type ClaimFolderCandidate,
} from "../src/lib/drive-folder-match";

function folder(
  partial: Pick<ClaimFolderCandidate, "folderId" | "folderName"> &
    Partial<ClaimFolderCandidate>,
): ClaimFolderCandidate {
  return {
    fromClosedCases: false,
    ...partial,
  };
}

const folders: ClaimFolderCandidate[] = [
  folder({
    folderId: "wrong",
    folderName: "BL99999 - Someone Else",
  }),
  folder({
    folderId: "correct",
    folderName: "BM47751 - Geovanni Manriquez Valdez",
  }),
  folder({
    folderId: "closed-correct",
    folderName: "CLOSED - BM47751 - Geovanni Manriquez Valdez",
    fromClosedCases: true,
  }),
];

// Prefer claim-named folder over a stale stored id pointing at another claim
assert.equal(
  findDriveFolderForClaim(folders, "BM47751", "wrong")?.folderId,
  "correct",
);

// Prefer active claim match over closed
assert.equal(
  findDriveFolderForClaim(folders, "BM47751", null)?.folderId,
  "correct",
);

// Keep preferred id when it already matches the claim
assert.equal(
  findDriveFolderForClaim(folders, "BM47751", "correct")?.folderId,
  "correct",
);

// Fall back to preferred id only when no claim match exists
assert.equal(
  findDriveFolderForClaim(
    [folder({ folderId: "orphan", folderName: "Notes" })],
    "BM47751",
    "orphan",
  )?.folderId,
  "orphan",
);

// A preferred id that is not in the live scan (e.g. Trash) must not win over a claim match
assert.equal(
  findDriveFolderForClaim(folders, "BM47751", "trashed-duplicate-id")?.folderId,
  "correct",
);

console.log("test-find-drive-folder-for-claim: all assertions passed");
