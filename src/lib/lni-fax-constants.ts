export const LNI_FAX_PRODUCTION = "3609024567";
export const LNI_FAX_TEST = "2064790710";
export const LNI_FAX_TEST_FORMATTED = "(206) 479-0710";

export type LniFaxDestination = "lni" | "test";

export function defaultLniFaxDestination(): LniFaxDestination {
  return "test";
}

export function parseLniFaxDestinationParam(
  value: string | null | undefined,
): LniFaxDestination | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized === "lni" || normalized === "test" ? normalized : undefined;
}

export function getLniFaxTestNumber(): string {
  return LNI_FAX_TEST;
}
