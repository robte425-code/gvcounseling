import { getSystemDriveAccessToken } from "@/lib/google-drive-system";
import {
  downloadLniRemittancePdf,
  remittanceFilenameSortKey,
  sortRemittanceFilenames,
} from "@/lib/lni-remittance-drive";
import { importRemittanceFromUpload } from "@/lib/remittance-advice";
import { getDriveFileMeta } from "@/lib/google-drive";

export type RemittanceImportResult = {
  name: string;
  status: "imported" | "failed";
  remittanceAdviceId?: string;
  error?: string;
};

type ImportItem = {
  name: string;
  sortKey: number;
  load: () => Promise<Buffer>;
};

export async function importRemittanceItemsInDateOrder(options: {
  items: ImportItem[];
  importedById: string;
}): Promise<RemittanceImportResult[]> {
  const ordered = [...options.items].sort((a, b) => {
    const dateDiff = a.sortKey - b.sortKey;
    if (dateDiff !== 0) return dateDiff;
    return a.name.localeCompare(b.name);
  });

  const results: RemittanceImportResult[] = [];

  for (const item of ordered) {
    try {
      const buffer = await item.load();
      const { remittanceAdviceId } = await importRemittanceFromUpload({
        buffer,
        sourceFilename: item.name,
        importedById: options.importedById,
      });
      results.push({ name: item.name, status: "imported", remittanceAdviceId });
    } catch (error) {
      results.push({
        name: item.name,
        status: "failed",
        error: error instanceof Error ? error.message : "Remittance import failed.",
      });
    }
  }

  return results;
}

export async function buildDriveImportItems(
  accessToken: string,
  driveFileIds: string[],
): Promise<ImportItem[]> {
  const items: ImportItem[] = [];

  for (const fileId of driveFileIds) {
    const meta = await getDriveFileMeta(accessToken, fileId);
    items.push({
      name: meta.name,
      sortKey: remittanceFilenameSortKey(meta.name),
      load: () =>
        downloadLniRemittancePdf(accessToken, {
          id: meta.id,
          name: meta.name,
          mimeType: meta.mimeType,
        }),
    });
  }

  return items;
}

export function buildUploadImportItems(files: File[]): ImportItem[] {
  const orderedNames = sortRemittanceFilenames(files.map((file) => file.name));
  const fileByName = new Map(files.map((file) => [file.name, file]));

  return orderedNames.map((name) => {
    const file = fileByName.get(name)!;
    return {
      name: file.name,
      sortKey: remittanceFilenameSortKey(file.name),
      load: async () => Buffer.from(await file.arrayBuffer()),
    };
  });
}

export async function importRemittancesFromDriveAndUploads(options: {
  driveFileIds: string[];
  files: File[];
  importedById: string;
}): Promise<RemittanceImportResult[]> {
  const items: ImportItem[] = [...buildUploadImportItems(options.files)];

  if (options.driveFileIds.length > 0) {
    const { accessToken } = await getSystemDriveAccessToken();
    items.push(...(await buildDriveImportItems(accessToken, options.driveFileIds)));
  }

  const deduped = new Map<string, ImportItem>();
  for (const item of items) {
    deduped.set(item.name, item);
  }

  return importRemittanceItemsInDateOrder({
    items: [...deduped.values()],
    importedById: options.importedById,
  });
}
