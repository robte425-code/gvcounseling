/**
 * One-shot: email admin a sample VRC BHI session notification (includes refer-a-client CTA).
 * Runs once on production build via PortalSetting marker.
 *
 * Manual:
 *   FORCE_SAMPLE_VRC_BHI_EMAIL=1 npx tsx scripts/send-sample-vrc-bhi-email.ts
 */
import "dotenv/config";

const DONE_KEY = "sample_vrc_bhi_email_refer_cta_blank_line_20260724_done";
const ADMIN_EMAIL =
  process.env.CONTACT_EMAIL?.trim() ||
  process.env.GOOGLE_DRIVE_SYSTEM_USER_EMAIL?.trim() ||
  "ghim@gvcounseling.com";

async function main() {
  if (!process.env.POSTMARK_SERVER_TOKEN?.trim()) {
    console.log("send-sample-vrc-bhi-email: POSTMARK_SERVER_TOKEN not set — skipping");
    return;
  }

  const force = process.env.FORCE_SAMPLE_VRC_BHI_EMAIL?.trim() === "1";

  if (process.env.DATABASE_URL?.trim() && !force) {
    const { prisma } = await import("../src/lib/prisma");
    const done = await prisma.portalSetting.findUnique({
      where: { key: DONE_KEY },
      select: { value: true },
    });
    if (done) {
      console.log("send-sample-vrc-bhi-email: already sent — skipping");
      await prisma.$disconnect();
      return;
    }
  }

  const { buildVrcEmailBody, vrcEmailSubject } = await import("../src/lib/vrc-billing-emails");
  const { sendEmailTo } = await import("../src/lib/email");

  // 96158 so the sample reads as a BHI session; swap for 90837 to see MHS.
  const sampleSessions = [
    { serviceDate: new Date(Date.UTC(2026, 6, 15)), procedureCode: "96158" }, // Jul 15, 2026
  ];
  const { text: bodyText, html: bodyHtml } = buildVrcEmailBody("Alex", sampleSessions, true);

  const sampleNote =
    `This is a sample of the VRC session notification email (no attachments). Live subject: "${vrcEmailSubject("BL12687", sampleSessions)}".`;
  const text = [sampleNote, "", bodyText].join("\n");
  const html = [`<p><em>${sampleNote}</em></p>`, bodyHtml].join("<br>\n");

  await sendEmailTo(ADMIN_EMAIL, {
    subject: "[SAMPLE] VRC session notification — refer-a-client CTA (blank line)",
    text,
    html,
  });

  console.log(`send-sample-vrc-bhi-email: sent sample to ${ADMIN_EMAIL}`);

  if (process.env.DATABASE_URL?.trim()) {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.portalSetting.upsert({
      where: { key: DONE_KEY },
      create: { key: DONE_KEY, value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("send-sample-vrc-bhi-email failed:", e);
  try {
    const { prisma } = await import("../src/lib/prisma");
    await prisma.$disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});
