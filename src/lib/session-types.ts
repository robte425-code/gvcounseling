/**
 * Which service a session was — BHI or MHS — from the procedure code billed.
 *
 * The two sit in different CPT families: 96156, 96158 and 96159 are health
 * behaviour assessment and intervention, billed here as BHI, and 90832, 90834 and
 * 90837 are psychotherapy, billed as MHS. Those two families cover every session
 * billed since 2025.
 *
 * A code in neither family gives null, and callers then describe the session
 * without naming a type rather than assert the wrong one. The codes that are
 * neither are all communications rather than sessions, and PROCEDURE_CODES in
 * constants.ts says what each one is.
 */
export type SessionType = "BHI" | "MHS";

/** A billed session, carrying enough to say what service it was and when. */
export type BilledSession = { serviceDate: Date; procedureCode: string };

const SESSION_TYPE_BY_CODE: Record<string, SessionType> = {
  "96156": "BHI",
  "96158": "BHI",
  "96159": "BHI",
  "90832": "MHS",
  "90834": "MHS",
  "90837": "MHS",
};

/**
 * A telephone call rather than a session. Billed, but with no session to
 * document, so its files are not sent to L&I or to a VRC.
 *
 * 98966 to 98968 are telephone evaluation and management, and 9919M is L&I's own
 * code for case management telephone calls — its "M" suffix marks it as a
 * Washington L&I local code rather than a CPT one, which is why it did not look
 * like the others. PROCEDURE_CODES in constants.ts describes all of them.
 *
 * Two codes are deliberately left out, and neither has ever been billed: 9918M is
 * electronic provider communication, not a call, and 1073M is the Activity
 * Prescription Form, which is a document L&I may well want to receive.
 */
const PHONE_CALL_CODES = new Set(["98966", "98967", "98968", "9919M"]);

export function isPhoneCallProcedureCode(code: string): boolean {
  return PHONE_CALL_CODES.has(code.trim().toUpperCase());
}

/**
 * Every line on this invoice is a phone call, so there is nothing to send.
 *
 * Judged per invoice because no invoice in the project's history mixes a call
 * with a session — all 1286 are one or the other — so dropping the whole invoice
 * cannot take a real session's notes with it.
 */
export function isPhoneCallOnly(lines: Array<{ procedureCode: string }>): boolean {
  return lines.length > 0 && lines.every((line) => isPhoneCallProcedureCode(line.procedureCode));
}

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
 *
 * Joined with "and" because every caller is describing what was delivered, where
 * both kinds of session happened.
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
