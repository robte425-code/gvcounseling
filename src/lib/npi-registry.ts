export type NpiRegistryProvider = {
  npi: string;
  name: string;
  credential: string | null;
  specialty: string | null;
  address: string | null;
  phone: string | null;
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

/** Parse attending doctor name into NPI Registry search parts. */
export function parseDoctorNameForNpiSearch(name: string): {
  firstName: string;
  lastName: string;
} | null {
  const cleaned = name
    .replace(/\b(MD|DO|M\.D\.|D\.O\.|DR\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;

  if (cleaned.includes(",")) {
    const [lastPart, rest] = cleaned.split(",", 2);
    const lastName = lastPart.trim();
    const firstName = rest.trim().split(/\s+/)[0]?.trim();
    if (!lastName || !firstName) return null;
    return { firstName, lastName };
  }

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return {
    firstName: parts[0]!,
    lastName: parts[parts.length - 1]!,
  };
}

/** Extract city and state from a free-text doctor address. */
export function parseCityStateFromAddress(address: string | null | undefined): {
  city?: string;
  state?: string;
} {
  if (!address?.trim()) return {};
  const match = address.match(/,\s*([^,]+),\s*([A-Z]{2})\b/i);
  if (!match) return {};
  return { city: match[1]!.trim(), state: match[2]!.toUpperCase() };
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

export async function searchAttendingNpiRegistry(options: {
  doctorName: string;
  state?: string | null;
  city?: string | null;
  doctorAddress?: string | null;
}): Promise<{ providers: NpiRegistryProvider[]; error?: string }> {
  const parsed = parseDoctorNameForNpiSearch(options.doctorName);
  if (!parsed) {
    return {
      providers: [],
      error: "Could not parse the attending doctor name. Edit the client and check the Doctor field.",
    };
  }

  const fromAddress = parseCityStateFromAddress(options.doctorAddress);
  const state = (options.state ?? fromAddress.state ?? "WA").trim().toUpperCase();
  const city = (options.city ?? fromAddress.city)?.trim();

  const params = new URLSearchParams({
    version: "2.1",
    limit: "50",
    first_name: parsed.firstName,
    last_name: parsed.lastName,
    state,
  });
  if (city) params.set("city", city);

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
