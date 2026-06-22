type Attachment = {
  filename: string;
  content: string;
};

type SendEmailOptions = {
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: Attachment[];
};

export async function sendEmail({ subject, text, replyTo, attachments = [] }: SendEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_EMAIL || "info@gvcounseling.com";
  const from = process.env.EMAIL_FROM || "Grandview Counseling <onboarding@resend.dev>";

  if (!apiKey) {
    throw new Error(
      "Email is not configured yet. Set RESEND_API_KEY and CONTACT_EMAIL in your Vercel environment variables.",
    );
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      reply_to: replyTo || undefined,
      attachments: attachments.length
        ? attachments.map((a) => ({ filename: a.filename, content: a.content }))
        : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email delivery failed: ${body}`);
  }
}
