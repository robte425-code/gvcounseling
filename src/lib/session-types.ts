/**
 * Which service a session was — BHI or MHS — from the procedure code billed.
 *
 * The two sit in different CPT families: 96156, 96158 and 96159 are health
 * behaviour assessment and intervention, billed here as BHI, and 90832, 90834 and
 * 90837 are psychotherapy, billed as MHS. Those two families cover every session
 * billed since 2025.
 *
 * A code in neither family gives null, and callers then describe the session
 * without naming a type rather than assert the wrong one. Older invoices carry
 * telephone codes (98966, 98967, 98968) that are neither, and one invoice carries
 * 9919M, which is not a procedure code at all.
 */
export type SessionType = "BHI" | "MHS";

const SESSION_TYPE_BY_CODE: Record<string, SessionType> = {
  "96156": "BHI",
  "96158": "BHI",
  "96159": "BHI",
  "90832": "MHS",
  "90834": "MHS",
  "90837": "MHS",
};

export function sessionTypeForProcedureCode(code: string): SessionType | null {
  return SESSION_TYPE_BY_CODE[code.trim().toUpperCase()] ?? null;
}

/**
 * The session types present across a set of procedure codes, in a fixed order so
 * the wording does not depend on which line happened to be billed first.
 */
export function sessionTypesForProcedureCodes(codes: Iterable<string>): SessionType[] {
  const present = new Set<SessionType>();
  for (const code of codes) {
    const type = sessionTypeForProcedureCode(code);
    if (type) present.add(type);
  }
  return (["BHI", "MHS"] as const).filter((type) => present.has(type));
}

/**
 * How to name those types in a sentence: "BHI", "MHS", "BHI and MHS", or an empty
 * string when none of the codes is recognised.
 */
export function sessionTypeNames(types: SessionType[]): string {
  return types.join(" and ");
}

/**
 * "a" or "an" for an initialism read out letter by letter. BHI opens on "bee" and
 * takes "a"; MHS opens on "em" and takes "an", which the letter alone does not
 * tell you.
 *
 * Only for initialisms. An ordinary word has to be judged on its own spelling —
 * "session" takes "a" even though S is read "ess".
 */
const LETTERS_SOUNDING_VOWEL_FIRST = new Set("AEFHILMNORSX".split(""));

export function indefiniteArticleForInitialism(name: string): "a" | "an" {
  const first = name.trim().charAt(0).toUpperCase();
  if (!first) return "a";
  return LETTERS_SOUNDING_VOWEL_FIRST.has(first) ? "an" : "a";
}
