import type { Prisma } from "@/generated/prisma/client";

export function normalizeClientSearchQuery(query: string | undefined): string {
  return query?.trim() ?? "";
}

export function clientListSearchWhere(query: string): Prisma.ClientWhereInput | undefined {
  const trimmed = query.trim();
  if (!trimmed) return undefined;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const tokenClause = (token: string): Prisma.ClientWhereInput => ({
    OR: [
      { lniClaimNumber: { contains: token, mode: "insensitive" } },
      { firstName: { contains: token, mode: "insensitive" } },
      { lastName: { contains: token, mode: "insensitive" } },
    ],
  });

  if (tokens.length === 1) return tokenClause(tokens[0]);

  return { AND: tokens.map(tokenClause) };
}

export function buildClientListHref(
  basePath: string,
  options: { status?: string; q?: string },
): string {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.q) params.set("q", options.q);
  const queryString = params.toString();
  return queryString ? `${basePath}?${queryString}` : basePath;
}
