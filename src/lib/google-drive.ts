import { isReferralSubmissionFilename, isLniClaimNumber, parseClaimNumber } from "@/lib/constants";

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
};

type DriveListResponse = {
  files?: DriveFile[];
  nextPageToken?: string;
};

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
  const files: DriveFile[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: "200",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await driveFetch<DriveListResponse>(accessToken, `/files?${params.toString()}`);
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return files;
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

export async function resolveTherapistFolderForUser(
  accessToken: string,
  therapist: { email: string; firstName: string },
): Promise<string> {
  const config = getTherapistFolderConfig();
  if (therapist.email === "maria@gvcounseling.com") {
    return resolveTherapistFolderId(accessToken, config.maria.folderId, config.maria.folderName);
  }
  if (therapist.email === "steven@gvcounseling.com") {
    return resolveTherapistFolderId(accessToken, config.steven.folderId, config.steven.folderName);
  }
  return resolveTherapistFolderId(
    accessToken,
    null,
    `${therapist.firstName}: Client files`,
  );
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
  const meta = await driveJson<{ parents?: string[] }>(
    accessToken,
    `/files/${folderId}?fields=parents&supportsAllDrives=true`,
  );
  const previousParents = (meta.parents ?? []).join(",");
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

export async function uploadDriveFile(
  accessToken: string,
  parentFolderId: string,
  filename: string,
  buffer: Buffer,
  mimeType?: string,
): Promise<void> {
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
}
