import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { VRC_BILLING_EMAIL_SIGNATURE } from "@/lib/vrc-billing-emails";

export async function generateLniFaxCoverPdf(options: {
  claimNumber: string;
  clientName: string;
  serviceDatesPhrase: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const { width, height } = page.getSize();

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 54;
  const { name, phone, email } = VRC_BILLING_EMAIL_SIGNATURE;

  // Claim # top-right (L&I requirement)
  const claimText = `Claim # ${options.claimNumber}`;
  const claimWidth = fontBold.widthOfTextAtSize(claimText, 12);
  page.drawText(claimText, {
    x: width - margin - claimWidth,
    y: height - margin,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  let y = height - margin - 48;

  page.drawText("Fax Cover Sheet", {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 36;

  const lines: Array<{ label: string; value: string }> = [
    { label: "Client", value: options.clientName },
    { label: "Service date(s)", value: options.serviceDatesPhrase },
    { label: "Provider", value: name },
    { label: "Practice", value: "Grandview Counseling" },
    { label: "Phone", value: phone },
    { label: "Email", value: email },
  ];

  for (const { label, value } of lines) {
    page.drawText(`${label}:`, {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.2, 0.2, 0.2),
    });
    page.drawText(value, {
      x: margin + 110,
      y,
      size: 11,
      font,
      color: rgb(0, 0, 0),
    });
    y -= 22;
  }

  y -= 12;
  page.drawText(
    "Attached: BHI session documentation for the above claim. Invoice submitted separately via L&I billing portal.",
    {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
      maxWidth: width - margin * 2,
      lineHeight: 14,
    },
  );

  return doc.save();
}
