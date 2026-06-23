/** Classify client-folder files for supplemental import (CAC + addresses only). */

export type ImportableDocCategory =
  | "claim-account-center"
  | "addresses-contacts"
  | "word-doc-cac-address"
  | "claim-number-pdf";

export function classifyClientDocument(filename: string): ImportableDocCategory | null {
  const n = filename.toLowerCase();

  if (/referral submission/.test(n)) return null;
  if (/bhi.*(approv|response|referral|request|letter)|ap response.*bhi|approval.*bhi|\bbhi\b/i.test(n))
    return null;
  if (/consent/.test(n)) return null;
  if (/medical|provider|note|addendum|recs/.test(n)) return null;
  if (/testing report|ld testing/.test(n)) return null;

  if (/claim\s*&\s*account|claim and account|\bcac\b|current claim status|claim status/.test(n))
    return "claim-account-center";
  if (/^([a-z]{1,2}\d+)\.pdf$/i.test(filename.trim())) return "claim-number-pdf";
  if (/address|contact/.test(n)) return "addresses-contacts";

  if (/\.docx?$/i.test(n)) {
    if (/address|contact|claim|cac|status/.test(n)) return "word-doc-cac-address";
    return null;
  }

  if (/\.pdf$/i.test(n)) return null;

  return null;
}

export function isTextExtractable(text: string, pages: number): boolean {
  const cleaned = text
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 80) return false;
  const letters = (cleaned.match(/[A-Za-z]/g) ?? []).length;
  if (letters < 40) return false;
  if (pages > 0 && cleaned.length / pages < 40) return false;
  return true;
}
