import { isReferralSubmissionFilename, isLniClaimNumber, parseClaimNumber } from "@/lib/constants";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

export type DriveItemLink = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  isFolder: boolean;
  depth: number;
};

export type ClientDriveFolderContents = {
  folderName: string;
  folderLink: string;
  items: DriveItemLink[];
};

type DriveListResponse = {
  files?: (DriveFile & { webViewLink?: string | null })[];
  nextPageToken?: string;
};

type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  webViewLink?: string | null;
};

export function driveViewLink(
  id: string,
  mimeType: string,
  webViewLink?: string | null,
): string {
  if (webViewLink) return webViewLink;
  if (mimeType === FOLDER_MIME) return `https://drive.google.com/drive/folders/${id}`;
  return `https://drive.google.com/file/d/${id}/view`;
}

async function driveFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function listFiles(accessToken: string, query: string): Promise<DriveFile[]> {
  const files = await listFilesWithLinks(accessToken, query);
  return files.map(({ id, name, mimeType }) => ({ id, name, mimeType }));
}

async function listFilesWithLinks(
  accessToken: string,
  query: string,
): Promise<(DriveFile & { webViewLink: string })[]> {
  const files: (DriveFile & { webViewLink: string })[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,webViewLink)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await driveFetch<DriveListResponse>(accessToken, `/files?${params.toString()}`);
    for (const file of data.files ?? []) {
      files.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        webViewLink: driveViewLink(file.id, file.mimeType, file.webViewLink),
      });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
}

function sortDriveItems<T extends { name: string; mimeType: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aFolder = a.mimeType === FOLDER_MIME;
    const bFolder = b.mimeType === FOLDER_MIME;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export async function getDriveFileMeta(
  accessToken: string,
  fileId: string,
): Promise<DriveFileMeta & { webViewLink: string }> {
  const params = new URLSearchParams({
    fields: "id,name,mimeType,webViewLink",
    supportsAllDrives: "true",
  });
  const data = await driveFetch<DriveFileMeta>(accessToken, `/files/${fileId}?${params.toString()}`);
  return {
    ...data,
    webViewLink: driveViewLink(data.id, data.mimeType, data.webViewLink),
  };
}

async function listFolderTree(
  accessToken: string,
  folderId: string,
  depth: number,
): Promise<DriveItemLink[]> {
  const query = [`'${folderId}' in parents`, "trashed=false"].join(" and ");
  const children = await sortDriveItems(await listFilesWithLinks(accessToken, query));
  const items: DriveItemLink[] = [];

  for (const child of children) {
    const isFolder = child.mimeType === FOLDER_MIME;
    items.push({
      id: child.id,
      name: child.name,
      mimeType: child.mimeType,
      webViewLink: child.webViewLink,
      isFolder,
      depth,
    });
    if (isFolder) {
      items.push(...(await listFolderTree(accessToken, child.id, depth + 1)));
    }
  }

  return items;
}

/** Lists the client folder and all nested folders/files with Drive view links. */
export async function listClientDriveContents(
  accessToken: string,
  clientFolderId: string,
): Promise<ClientDriveFolderContents> {
  const folder = await getDriveFileMeta(accessToken, clientFolderId);
  const items = await listFolderTree(accessToken, clientFolderId, 0);
  return {
    folderName: folder.name,
    folderLink: folder.webViewLink,
    items,
  };
}

export function getTherapistFolderConfig() {
  return {
    maria: {
      folderId: process.env.GOOGLE_DRIVE_MARIA_FOLDER_ID?.trim() || null,
      folderName: process.env.GOOGLE_DRIVE_MARIA_FOLDER_NAME?.trim() || "Maria: Client files",
    },
    steven: {
      folderId: process.env.GOOGLE_DRIVE_STEVEN_FOLDER_ID?.trim() || null,
      folderName: process.env.GOOGLE_DRIVE_STEVEN_FOLDER_NAME?.trim() || "Steven: Client files",
    },
  };
}

export async function resolveTherapistFolderId(
  accessToken: string,
  folderId: string | null,
  folderName: string,
): Promise<string> {
  if (folderId) return folderId;

  const query = [
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
    `name='${escapeDriveQuery(folderName)}'`,
  ].join(" and ");

  const matches = await listFiles(accessToken, query);
  if (!matches.length) {
    throw new Error(`Could not find folder "${folderName}" in your Google Drive.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Multiple folders named "${folderName}" were found. Set GOOGLE_DRIVE_*_FOLDER_ID in env to pick one.`,
    );
  }
  return matches[0]!.id;
}

export function parseClientFolderName(name: string): { claimNumber: string; displayName: string } | null {
  const dash = name.indexOf(" - ");
  if (dash === -1) return null;

  const claimNumber = parseClaimNumber(name.slice(0, dash).trim());
  const displayName = name.slice(dash + 3).trim();
  if (!isLniClaimNumber(claimNumber) || !displayName) return null;

  return { claimNumber, displayName };
}

export async function listClientFolders(accessToken: string, parentFolderId: string): Promise<DriveFile[]> {
  const query = [
    `'${parentFolderId}' in parents`,
    "mimeType='application/vnd.google-apps.folder'",
    "trashed=false",
  ].join(" and ");

  return listFiles(accessToken, query);
}

export async function findReferralSubmissionFile(
  accessToken: string,
  clientFolderId: string,
): Promise<DriveFile | null> {
  const query = [`'${clientFolderId}' in parents`, "trashed=false"].join(" and ");
  const files = await listFiles(accessToken, query);
  return files.find((f) => isReferralSubmissionFilename(f.name)) ?? null;
}

export async function listClientFolderFiles(
  accessToken: string,
  clientFolderId: string,
): Promise<DriveFile[]> {
  const query = [`'${clientFolderId}' in parents`, "trashed=false"].join(" and ");
  return listFiles(accessToken, query);
}

export async function downloadFileBuffer(accessToken: string, file: DriveFile): Promise<Buffer> {
  let res: Response;

  if (file.mimeType === GOOGLE_DOC_MIME) {
    const params = new URLSearchParams({ mimeType: DOCX_MIME });
    res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/export?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } else {
    res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  if (!res.ok) {
    throw new Error(`Failed to download "${file.name}" (${res.status}).`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadReferralDocx(accessToken: string, file: DriveFile): Promise<Buffer> {
  let res: Response;

  if (file.mimeType === GOOGLE_DOC_MIME) {
    const params = new URLSearchParams({ mimeType: DOCX_MIME });
    res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${file.id}/export?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  } else if (file.mimeType === DOCX_MIME || file.name.toLowerCase().endsWith(".docx")) {
    res = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } else {
    throw new Error(`Unsupported referral file type: ${file.mimeType}`);
  }

  if (!res.ok) {
    throw new Error(`Failed to download "${file.name}" (${res.status}).`);
  }

  return Buffer.from(await res.arrayBuffer());
}

export function getNewReferralsFolderConfig() {
  return {
    folderId: process.env.GOOGLE_DRIVE_NEW_REFERRALS_FOLDER_ID?.trim() || null,
    folderName:
      process.env.GOOGLE_DRIVE_NEW_REFERRALS_FOLDER_NAME?.trim() || "New Referrals",
  };
}

export async function resolveNewReferralsFolderId(accessToken: string): Promise<string> {
  const config = getNewReferralsFolderConfig();
  return resolveTherapistFolderId(accessToken, config.folderId, config.folderName);
}

export function therapistDriveFolderName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}: Client files`.replace(/\s+/g, " ");
}

export async function resolveTherapistParentFolderId(accessToken: string): Promise<string> {
  const override = process.env.GOOGLE_DRIVE_THERAPIST_PARENT_FOLDER_ID?.trim();
  if (override) return override;

  const config = getTherapistFolderConfig();
  const mariaFolderId = await resolveTherapistFolderId(
    accessToken,
    config.maria.folderId,
    config.maria.folderName,
  );
  const parents = await getDriveFolderParentIds(accessToken, mariaFolderId);
  if (parents.length === 1) return parents[0]!;
  throw new Error(
    "Could not determine therapist folder parent in Google Drive. Set GOOGLE_DRIVE_THERAPIST_PARENT_FOLDER_ID.",
  );
}

export async function resolveTherapistFolderInParent(
  accessToken: string,
  parentFolderId: string,
  folderName: string,
  folderId?: string | null,
): Promise<string> {
  if (folderId) return folderId;
  const existing = await findDriveFolderByName(accessToken, parentFolderId, folderName);
  if (!existing) {
    throw new Error(`Could not find folder "${folderName}" in Google Drive.`);
  }
  return existing;
}

export async function ensureTherapistDriveFolder(
  accessToken: string,
  therapist: { firstName: string; lastName: string },
): Promise<string> {
  const parentId = await resolveTherapistParentFolderId(accessToken);
  const folderName = therapistDriveFolderName(therapist.firstName, therapist.lastName);
  return getOrCreateDriveSubfolder(accessToken, parentId, folderName);
}

export async function resolveTherapistFolderForUser(
  accessToken: string,
  therapist: { email: string; firstName: string; lastName: string },
): Promise<string> {
  const config = getTherapistFolderConfig();
  if (therapist.email === "maria@gvcounseling.com") {
    return resolveTherapistFolderId(accessToken, config.maria.folderId, config.maria.folderName);
  }
  if (therapist.email === "steven@gvcounseling.com") {
    return resolveTherapistFolderId(accessToken, config.steven.folderId, config.steven.folderName);
  }
  const parentId = await resolveTherapistParentFolderId(accessToken);
  const folderName = therapistDriveFolderName(therapist.firstName, therapist.lastName);
  return resolveTherapistFolderInParent(accessToken, parentId, folderName);
}

async function listDriveFolderChildren(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const query = [`'${folderId}' in parents`, "trashed=false"].join(" and ");
  return listFiles(accessToken, query);
}

async function trashDriveFile(accessToken: string, fileId: string): Promise<void> {
  await driveJson(accessToken, `/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  });
}

const SERVICE_DATE_FOLDER_NAME = /^\d{2}-\d{2}-\d{4}$/;

/** Extract a Google Drive file id from a view/share URL. */
export function parseDriveFileIdFromUrl(url: string): string | null {
  const fileMatch = /\/file\/d\/([^/?#]+)/.exec(url);
  if (fileMatch) return fileMatch[1]!;
  const openMatch = /[?&]id=([^&#]+)/.exec(url);
  if (openMatch) return openMatch[1]!;
  return null;
}

/** Trash invoice attachment files and any empty mm-dd-yyyy service-date subfolders. */
export async function deleteInvoiceDriveAttachments(
  accessToken: string,
  clientFolderId: string,
  attachments: { blobUrl: string }[],
): Promise<void> {
  for (const attachment of attachments) {
    const fileId = parseDriveFileIdFromUrl(attachment.blobUrl);
    if (!fileId) continue;
    try {
      await trashDriveFile(accessToken, fileId);
    } catch (error) {
      console.error(`Failed to trash Drive file ${fileId}:`, error);
    }
  }

  const folders = await listDriveFolderChildren(accessToken, clientFolderId);
  for (const folder of folders) {
    if (folder.mimeType !== FOLDER_MIME || !SERVICE_DATE_FOLDER_NAME.test(folder.name)) continue;
    const contents = await listDriveFolderChildren(accessToken, folder.id);
    if (contents.length === 0) {
      try {
        await trashDriveFile(accessToken, folder.id);
      } catch (error) {
        console.error(`Failed to trash Drive folder ${folder.name}:`, error);
      }
    }
  }
}

/** Move all items from the therapist folder to New Referrals, then trash the folder. */
export async function removeTherapistDriveFolder(
  accessToken: string,
  therapist: { email: string; firstName: string; lastName: string },
): Promise<void> {
  let therapistFolderId: string;
  try {
    therapistFolderId = await resolveTherapistFolderForUser(accessToken, therapist);
  } catch {
    return;
  }

  const referralsFolderId = await resolveNewReferralsFolderId(accessToken);
  const children = await listDriveFolderChildren(accessToken, therapistFolderId);
  for (const child of children) {
    await moveDriveFolder(accessToken, child.id, referralsFolderId);
  }
  await trashDriveFile(accessToken, therapistFolderId);
}

async function driveJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Drive API error (${res.status}): ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function createDriveFolder(
  accessToken: string,
  name: string,
  parentFolderId: string,
): Promise<string> {
  const data = await driveJson<{ id: string }>(
    accessToken,
    "/files?supportsAllDrives=true",
    {
      method: "POST",
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      }),
    },
  );
  return data.id;
}

export async function moveDriveFolder(
  accessToken: string,
  folderId: string,
  newParentFolderId: string,
): Promise<void> {
  const previousParents = (await getDriveFolderParentIds(accessToken, folderId)).join(",");
  const params = new URLSearchParams({
    addParents: newParentFolderId,
    removeParents: previousParents,
    supportsAllDrives: "true",
  });
  await driveJson(
    accessToken,
    `/files/${folderId}?${params.toString()}`,
    { method: "PATCH", body: JSON.stringify({}) },
  );
}

export async function getDriveFolderParentIds(
  accessToken: string,
  folderId: string,
): Promise<string[]> {
  const meta = await driveJson<{ parents?: string[] }>(
    accessToken,
    `/files/${folderId}?fields=parents&supportsAllDrives=true`,
  );
  return meta.parents ?? [];
}

function mimeTypeForFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}

export async function findDriveFolderByName(
  accessToken: string,
  parentFolderId: string,
  name: string,
): Promise<string | null> {
  const q = `'${parentFolderId}' in parents and mimeType='${FOLDER_MIME}' and name='${escapeDriveQuery(name)}' and trashed=false`;
  const files = await listFiles(accessToken, q);
  return files[0]?.id ?? null;
}

export async function getOrCreateDriveSubfolder(
  accessToken: string,
  parentFolderId: string,
  name: string,
): Promise<string> {
  const existing = await findDriveFolderByName(accessToken, parentFolderId, name);
  if (existing) return existing;
  return createDriveFolder(accessToken, name, parentFolderId);
}

export async function uploadDriveFile(
  accessToken: string,
  parentFolderId: string,
  filename: string,
  buffer: Buffer,
  mimeType?: string,
): Promise<{ id: string; webViewLink: string }> {
  const type = mimeType || mimeTypeForFilename(filename);
  const metadata = JSON.stringify({ name: filename, parents: [parentFolderId] });
  const boundary = "gc_referral_upload_boundary";
  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${type}\r\n\r\n`,
    buffer,
    `\r\n--${boundary}--`,
  ];
  const body = Buffer.concat(
    bodyParts.map((part) => (typeof part === "string" ? Buffer.from(part) : part)),
  );

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to upload "${filename}" (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id: string; webViewLink?: string | null };
  return {
    id: data.id,
    webViewLink: driveViewLink(data.id, type, data.webViewLink),
  };
}
