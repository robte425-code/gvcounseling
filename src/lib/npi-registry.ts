export type NpiRegistryProvider = {
  npi: string;
  name: string;
  credential: string | null;
  specialty: string | null;
  address: string | null;
  phone: string | null;
};

export type NpiSearchVariant = {
  firstName?: string;
  lastName: string;
};

type NpiApiAddress = {
  address_purpose?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  telephone_number?: string;
};

type NpiApiResult = {
  number: string;
  enumeration_type?: string;
  basic?: {
    first_name?: string;
    last_name?: string;
    middle_name?: string;
    credential?: string;
    organization_name?: string;
  };
  addresses?: NpiApiAddress[];
  taxonomies?: { desc?: string; primary?: boolean }[];
};

type NpiApiResponse = {
  result_count?: number;
  results?: NpiApiResult[];
  Errors?: { description?: string }[];
};

const NPI_REGISTRY_API = "https://npiregistry.cms.hhs.gov/api/";

/** L&I referral imports: LAST FIRST [M] CREDENTIAL (e.g. SAWYER JESSICA K PAC). */
const LNI_DOCTOR_NAME =
  /^[A-Z][A-Z'-]+\s+[A-Z][A-Z'-]+(?:\s+[A-Z]\.?)?\s+(?:PAC|PA-C|ARNP|MD|DO|DC|APRN|NP|ND)\b/i;

/** Common medical credentials that appear in referral imports, not part of the legal name. */
const CREDENTIAL_PATTERN =
  /\b(PAC|PA-C|P\.A\.C?\.?|PA|NP|FNP-C?|ARNP|APRN|DNP|MD|M\.D\.|DO|D\.O\.|PHD|PH\.D\.|PSYD|PSY\.D\.|LMFT|LMFTA|LCSW|LICSW|PT|OT|DC|DDS|DMD|CNP|CRNP|DR|DR\.|DPM|OD|RN|MSW|MA|MS|MBA|FACP|FACS|JD|ND)\b/gi;

function stripCredentials(text: string): string {
  return text.replace(CREDENTIAL_PATTERN, "").replace(/\s+/g, " ").trim();
}

function isMiddleInitial(token: string): boolean {
  return /^[A-Z]\.?$/i.test(token);
}

function variantKey(variant: NpiSearchVariant): string {
  return `${variant.firstName ?? ""}|${variant.lastName}`.toLowerCase();
}

function addVariant(
  variants: NpiSearchVariant[],
  seen: Set<string>,
  firstName: string | undefined,
  lastName: string,
) {
  const trimmedLast = lastName.trim();
  if (!trimmedLast) return;
  const trimmedFirst = firstName?.trim() || undefined;
  const variant: NpiSearchVariant = { firstName: trimmedFirst, lastName: trimmedLast };
  const key = variantKey(variant);
  if (seen.has(key)) return;
  seen.add(key);
  variants.push(variant);
}

/** Build multiple first/last combinations to try against the NPI Registry. */
export function generateNpiSearchVariants(name: string): NpiSearchVariant[] {
  const cleaned = stripCredentials(name);
  if (!cleaned) return [];

  const variants: NpiSearchVariant[] = [];
  const seen = new Set<string>();
  const lniFormat = LNI_DOCTOR_NAME.test(name.trim());

  if (cleaned.includes(",")) {
    const [lastPart, rest] = cleaned.split(",", 2);
    const lastTokens = lastPart.trim().split(/\s+/).filter(Boolean);
    const firstTokens = rest.trim().split(/\s+/).filter(Boolean);

    const lastName = lastTokens[0];
    const firstName = firstTokens[0];
    if (lastName) addVariant(variants, seen, firstName, lastName);
    if (lastName && lastTokens.length > 1) {
      addVariant(variants, seen, firstName, lastTokens[lastTokens.length - 1]!);
    }
    if (firstName && firstTokens.length > 1) {
      addVariant(variants, seen, firstTokens[firstTokens.length - 1], lastName ?? firstName);
    }
    if (lastName) addVariant(variants, seen, undefined, lastName);
    return variants;
  }

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) {
    addVariant(variants, seen, undefined, tokens[0]!);
    return variants;
  }

  if (tokens.length === 2) {
    if (lniFormat) {
      addVariant(variants, seen, tokens[1], tokens[0]!);
    }
    addVariant(variants, seen, tokens[0], tokens[1]!);
    addVariant(variants, seen, tokens[1], tokens[0]!);
    addVariant(variants, seen, undefined, tokens[0]!);
    addVariant(variants, seen, undefined, tokens[1]!);
    return variants;
  }

  const lastToken = tokens[tokens.length - 1]!;
  const trailingMiddle = isMiddleInitial(lastToken);

  // LNI LAST FIRST M: SAWYER JESSICA K
  if (lniFormat || (trailingMiddle && tokens[1]!.length >= 2)) {
    addVariant(variants, seen, tokens[1], tokens[0]!);
    addVariant(variants, seen, undefined, tokens[0]!);
  }

  // FIRST M LAST: JOHN W SMITH
  if (tokens.length >= 3 && isMiddleInitial(tokens[1]!)) {
    addVariant(variants, seen, tokens[0], lastToken);
    addVariant(variants, seen, undefined, lastToken);
  }

  // FIRST … LAST (Western order)
  if (!trailingMiddle || tokens.length > 3) {
    addVariant(variants, seen, tokens[0], lastToken);
  }

  if (!trailingMiddle) {
    addVariant(variants, seen, lastToken, tokens[0]!);
    addVariant(variants, seen, undefined, lastToken);
  }
  addVariant(variants, seen, undefined, tokens[0]!);
  return variants;
}

/** Primary name parse for display; uses the first search variant. */
export function parseDoctorNameForNpiSearch(name: string): {
  firstName: string;
  lastName: string;
} | null {
  const variant = generateNpiSearchVariants(name)[0];
  if (!variant) return null;
  return {
    firstName: variant.firstName ?? "",
    lastName: variant.lastName,
  };
}

/** Extract city, state, and ZIP from a free-text doctor address. */
export function parseCityStateFromAddress(address: string | null | undefined): {
  city?: string;
  state?: string;
  postalCode?: string;
} {
  if (!address?.trim()) return {};
  const match = address.match(/,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?\b/i);
  if (!match) {
    const fallback = address.match(/,\s*([^,]+),\s*([A-Z]{2})\b/i);
    if (!fallback) return {};
    return { city: fallback[1]!.trim(), state: fallback[2]!.toUpperCase() };
  }
  return {
    city: match[1]!.trim(),
    state: match[2]!.toUpperCase(),
    postalCode: match[3],
  };
}

function normalizePhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

function scoreProvider(
  provider: NpiRegistryProvider,
  hints: {
    firstName?: string;
    lastName?: string;
    phone?: string;
  },
): number {
  let score = 0;
  const providerPhone = normalizePhone(provider.phone);
  const hintPhone = normalizePhone(hints.phone);
  if (hintPhone.length >= 10 && providerPhone.endsWith(hintPhone.slice(-10))) {
    score += 100;
  }

  const nameUpper = provider.name.toUpperCase();
  if (hints.firstName && nameUpper.includes(hints.firstName.toUpperCase())) score += 20;
  if (hints.lastName && nameUpper.includes(hints.lastName.toUpperCase())) score += 10;

  return score;
}

function formatProviderName(result: NpiApiResult): string {
  const basic = result.basic;
  if (!basic) return result.number;
  if (basic.organization_name) return basic.organization_name;
  const parts = [basic.first_name, basic.middle_name, basic.last_name].filter(Boolean);
  return parts.join(" ");
}

function pickLocationAddress(addresses: NpiApiAddress[] | undefined): NpiApiAddress | undefined {
  if (!addresses?.length) return undefined;
  return (
    addresses.find((a) => a.address_purpose === "LOCATION") ??
    addresses.find((a) => a.address_purpose === "MAILING") ??
    addresses[0]
  );
}

function formatAddress(addr: NpiApiAddress | undefined): string | null {
  if (!addr) return null;
  const line = [addr.address_1, addr.address_2].filter(Boolean).join(", ");
  const cityState = [addr.city, addr.state].filter(Boolean).join(", ");
  const parts = [line, cityState, addr.postal_code?.slice(0, 5)].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function mapResult(result: NpiApiResult): NpiRegistryProvider {
  const addr = pickLocationAddress(result.addresses);
  const primaryTaxonomy =
    result.taxonomies?.find((t) => t.primary)?.desc ?? result.taxonomies?.[0]?.desc ?? null;
  const credential =
    result.basic?.credential && result.basic.credential !== "--" ? result.basic.credential : null;

  return {
    npi: result.number,
    name: formatProviderName(result),
    credential,
    specialty: primaryTaxonomy,
    address: formatAddress(addr),
    phone: addr?.telephone_number ?? null,
  };
}

async function fetchNpiResults(
  variant: NpiSearchVariant,
  state: string,
): Promise<{ providers: NpiRegistryProvider[]; error?: string }> {
  const params = new URLSearchParams({
    version: "2.1",
    limit: "50",
    last_name: variant.lastName,
    state,
  });
  if (variant.firstName) params.set("first_name", variant.firstName);

  let response: Response;
  try {
    response = await fetch(`${NPI_REGISTRY_API}?${params.toString()}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
  } catch {
    return { providers: [], error: "Could not reach the NPI Registry. Try again in a moment." };
  }

  if (!response.ok) {
    return { providers: [], error: `NPI Registry returned ${response.status}.` };
  }

  const data = (await response.json()) as NpiApiResponse;
  if (data.Errors?.length) {
    return {
      providers: [],
      error: data.Errors.map((e) => e.description).filter(Boolean).join(" ") || "NPI search failed.",
    };
  }

  const providers = (data.results ?? [])
    .filter((r) => r.enumeration_type === "NPI-1")
    .map(mapResult);

  return { providers };
}

function formatVariantLabel(variant: NpiSearchVariant): string {
  if (variant.firstName) return `${variant.firstName} ${variant.lastName}`;
  return variant.lastName;
}

export async function searchAttendingNpiRegistry(options: {
  doctorName: string;
  state?: string | null;
  doctorPhone?: string | null;
}): Promise<{
  providers: NpiRegistryProvider[];
  searchVariants: string[];
  error?: string;
}> {
  const variants = generateNpiSearchVariants(options.doctorName);
  if (variants.length === 0) {
    return {
      providers: [],
      searchVariants: [],
      error: "Could not parse the attending doctor name. Edit the client and check the Doctor field.",
    };
  }

  const state = (options.state ?? "WA").trim().toUpperCase();

  const [primaryVariant, ...fallbackVariants] = variants;
  const scoreHints = {
    firstName: primaryVariant?.firstName,
    lastName: primaryVariant?.lastName,
    phone: options.doctorPhone ?? undefined,
  };

  const seenNpis = new Set<string>();
  let providers: NpiRegistryProvider[] = [];
  const searchVariants: string[] = [];
  let lastError: string | undefined;

  async function collect(variant: NpiSearchVariant): Promise<number> {
    const label = formatVariantLabel(variant);
    searchVariants.push(`${label} (${state})`);

    const result = await fetchNpiResults(variant, state);
    if (result.error) lastError = result.error;

    let added = 0;
    for (const provider of result.providers) {
      if (seenNpis.has(provider.npi)) continue;
      seenNpis.add(provider.npi);
      providers.push(provider);
      added++;
    }
    return added;
  }

  async function searchVariantList(variantList: NpiSearchVariant[]) {
    for (const variant of variantList) {
      await collect(variant);
    }
  }

  await searchVariantList([primaryVariant!]);
  if (providers.length === 0 && fallbackVariants.length > 0) {
    await searchVariantList(fallbackVariants);
  }

  providers.sort((a, b) => scoreProvider(b, scoreHints) - scoreProvider(a, scoreHints));

  if (providers.length === 0 && lastError) {
    return { providers: [], searchVariants, error: lastError };
  }

  return { providers, searchVariants };
}
