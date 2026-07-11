export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const REFERRAL_MAX_FILE_BYTES = 15 * 1024 * 1024;
export const REFERRAL_MAX_TOTAL_BYTES = 40 * 1024 * 1024;
export const REFERRAL_MAX_FILES = 7;

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

function isSafeFilename(filename: string): boolean {
  const trimmed = filename.trim();
  if (!trimmed) return false;
  if (trimmed.includes("/") || trimmed.includes("\\")) return false;
  if (trimmed.includes("..")) return false;
  return true;
}

function normalizeMimeType(filename: string, mimeType: string): string {
  const normalized = (mimeType || "application/octet-stream").toLowerCase().split(";")[0]!.trim();
  if (ALLOWED_MIME_TYPES.has(normalized)) return normalized;

  const extMime = EXTENSION_TO_MIME[fileExtension(filename)];
  if (extMime) return extMime;

  return normalized;
}

export function validateUploadedFile(filename: string, mimeType: string, size: number): void {
  if (!isSafeFilename(filename)) {
    throw new UploadValidationError("Invalid file name.");
  }
  if (size <= 0) {
    throw new UploadValidationError("Empty files are not allowed.");
  }
  if (size > REFERRAL_MAX_FILE_BYTES) {
    throw new UploadValidationError(
      `Each file must be ${Math.round(REFERRAL_MAX_FILE_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }

  const normalized = normalizeMimeType(filename, mimeType);
  if (!ALLOWED_MIME_TYPES.has(normalized)) {
    throw new UploadValidationError(
      "Only PDF, image, and Word document uploads are allowed.",
    );
  }
}

export function validateReferralUploadBatch(
  files: { filename: string; mimeType: string; buffer: Buffer }[],
): void {
  if (files.length > REFERRAL_MAX_FILES) {
    throw new UploadValidationError(`At most ${REFERRAL_MAX_FILES} files are allowed.`);
  }

  let totalBytes = 0;
  for (const file of files) {
    validateUploadedFile(file.filename, file.mimeType, file.buffer.length);
    totalBytes += file.buffer.length;
  }

  if (totalBytes > REFERRAL_MAX_TOTAL_BYTES) {
    throw new UploadValidationError(
      `Total upload size must be ${Math.round(REFERRAL_MAX_TOTAL_BYTES / (1024 * 1024))} MB or smaller.`,
    );
  }
}
