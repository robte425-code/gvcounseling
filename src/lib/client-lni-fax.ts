import { formatDate } from "@/lib/constants";
import { sendFax } from "@/lib/faxage";
import {
  getOrCreateDriveSubfolder,
  uploadDriveFile,
} from "@/lib/google-drive";
import { getDriveAccessTokenForClient } from "@/lib/google-drive-access";
import { generateLniFaxCoverPdf } from "@/lib/lni-fax-cover";
import { LNI_FAX_PRODUCTION, LNI_FAX_TEST, type LniFaxDestination } from "@/lib/lni-fax-constants";
import { getLniOutboundFaxRoute } from "@/lib/portal-settings";
import { prisma } from "@/lib/prisma";

export type ClientLniFaxFile = {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
};

export type ClientLniFaxResult = {
  jobId: string;
  faxDestination: LniFaxDestination;
  faxNumber: string;
  uploadedFilenames: string[];
  driveFolderName: string;
};

function resolveFaxNumber(
  intendedFax: string,
  destination: LniFaxDestination,
): { faxno: string; redirected: boolean } {
  if (destination === "lni") {
    return { faxno: intendedFax, redirected: false };
  }
  return { faxno: LNI_FAX_TEST, redirected: true };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "document.pdf";
}

function folderDateLabel(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function faxClientDocumentsToLni(options: {
  clientId: string;
  initiatorUserId: string;
  providerName: string;
  files: ClientLniFaxFile[];
}): Promise<ClientLniFaxResult> {
  if (options.files.length === 0) {
    throw new Error("Add at least one file to fax.");
  }

  const client = await prisma.client.findUnique({
    where: { id: options.clientId },
    include: {
      therapist: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!client) throw new Error("Client not found.");
  if (!client.driveFolderId) {
    throw new Error(
      "This client has no Google Drive folder. Sync or create the client folder before faxing.",
    );
  }

  const destination = await getLniOutboundFaxRoute();
  const { faxno, redirected } = resolveFaxNumber(LNI_FAX_PRODUCTION, destination);
  const clientName = `${client.lastName}, ${client.firstName}`;
  const providerName = options.providerName.trim() || "Grandview Counseling";
  const faxedAt = new Date();
  const serviceDatesPhrase = formatDate(faxedAt);

  const coverPdf = await generateLniFaxCoverPdf({
    claimNumber: client.lniClaimNumber,
    clientName,
    providerName,
    serviceDatesPhrase,
    coverNote:
      "Attached: documents for the above claim submitted by Grandview Counseling.",
  });

  const accessToken = await getDriveAccessTokenForClient({
    therapistId: client.therapistId,
    initiatorUserId: options.initiatorUserId,
  });

  const lniFaxesFolderId = await getOrCreateDriveSubfolder(
    accessToken,
    client.driveFolderId,
    "L&I Faxes",
  );
  const batchFolderName = folderDateLabel(faxedAt);
  const batchFolderId = await getOrCreateDriveSubfolder(
    accessToken,
    lniFaxesFolderId,
    batchFolderName,
  );

  const coverFilename = `cover-${client.lniClaimNumber.replace(/\W/g, "")}.pdf`;
  await uploadDriveFile(
    accessToken,
    batchFolderId,
    coverFilename,
    Buffer.from(coverPdf),
    "application/pdf",
  );

  const uploadedFilenames: string[] = [coverFilename];
  const faxFilenames: string[] = [coverFilename];
  const faxDataBase64: string[] = [Buffer.from(coverPdf).toString("base64")];

  for (const file of options.files) {
    const filename = sanitizeFilename(file.filename);
    await uploadDriveFile(
      accessToken,
      batchFolderId,
      filename,
      file.buffer,
      file.mimeType,
    );
    uploadedFilenames.push(filename);
    faxFilenames.push(filename);
    faxDataBase64.push(file.buffer.toString("base64"));
  }

  const recipname = redirected
    ? `[TEST] L&I — ${client.lniClaimNumber}`
    : "Washington State L&I";

  const sendResult = await sendFax({
    faxno,
    recipname,
    filenames: faxFilenames,
    fileDataBase64: faxDataBase64,
  });

  return {
    jobId: sendResult.jobId,
    faxDestination: destination,
    faxNumber: faxno,
    uploadedFilenames,
    driveFolderName: `L&I Faxes/${batchFolderName}`,
  };
}
