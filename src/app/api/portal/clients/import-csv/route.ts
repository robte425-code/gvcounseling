import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth";
import { parseClaimNumber } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * Split one CSV row, honouring quoted fields.
 *
 * Splitting on bare commas meant a single quoted name like "Smith, John" shifted
 * every later column by one, and the "Unknown" fallback then wrote that literal
 * string in as a client's legal name.
 */
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (inQuotes) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = splitCsvRow(lines[0]!).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map((line) => {
    const cols = splitCsvRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const formData = await request.formData();
    const file = formData.get("file");
    const defaultTherapistId = String(formData.get("therapistId") ?? "");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCsv(text);
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of rows) {
      const claim = parseClaimNumber(row.claim_number ?? row.claim ?? "");
      if (!claim) {
        errors.push("Skipped row with missing claim number");
        continue;
      }

      let therapistId = defaultTherapistId;
      const therapistEmail = row.therapist_email?.toLowerCase();
      if (therapistEmail) {
        const therapist = await prisma.user.findUnique({ where: { email: therapistEmail } });
        if (therapist) therapistId = therapist.id;
      }

      const existing = await prisma.client.findUnique({ where: { lniClaimNumber: claim } });
      const data = {
        lniClaimNumber: claim,
        firstName: row.first_name || existing?.firstName || "Unknown",
        lastName: row.last_name || existing?.lastName || "Unknown",
        vrcName: row.vrc_name || existing?.vrcName || null,
        therapistId: existing?.therapistId ?? therapistId,
        diagnoses: existing?.diagnoses ?? [],
      };

      if (existing) {
        await prisma.client.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.client.create({ data });
        created++;
      }
    }

    // Its two sibling import routes revalidate; this one did not, so the clients
    // list could still render without the rows just imported and an admin would
    // reasonably re-upload the same file.
    revalidatePath("/portal/admin/clients");

    return NextResponse.json({ created, updated, errors });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed." },
      { status: 500 },
    );
  }
}
