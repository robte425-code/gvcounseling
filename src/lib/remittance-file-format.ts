import type { RemittanceSourceFormat } from "@/generated/prisma/client";

const ERA_EXTENSIONS = /\.(835|edi|x12|txt)$/i;

export function detectRemittanceSourceFormat(
  buffer: Buffer,
  sourceFilename: string,
): RemittanceSourceFormat {
  const head = buffer.subarray(0, Math.min(512, buffer.length)).toString("utf8").trimStart();
  if (head.startsWith("ISA") || head.includes("ST*835") || head.includes("ST|835")) {
    return "ERA_835";
  }
  if (ERA_EXTENSIONS.test(sourceFilename)) {
    return "ERA_835";
  }
  return "PDF_RA";
}

export function remittanceSourceFormatLabel(format: RemittanceSourceFormat): string {
  return format === "ERA_835" ? "835 ERA" : "PDF RA";
}

export function remittanceUploadAcceptAttribute(): string {
  return "application/pdf,.pdf,.835,.edi,.txt,.x12,text/plain";
}
