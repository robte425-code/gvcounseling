type Attachment = {
  filename: string;
  content: string;
  contentType?: string;
};

type SendEmailOptions = {
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: Attachment[];
};

function contentTypeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}

async function postmarkSend(to: string, options: SendEmailOptions) {
  const serverToken = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.EMAIL_FROM || "info@gvcounseling.com";

  if (!serverToken) {
    throw new Error(
      "Email is not configured yet. Set POSTMARK_SERVER_TOKEN and CONTACT_EMAIL in your Vercel environment variables.",
    );
  }

  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": serverToken,
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: options.subject,
      TextBody: options.text,
      ReplyTo: options.replyTo || undefined,
      MessageStream: "outbound",
      Attachments: options.attachments?.length
        ? options.attachments.map((a) => ({
            Name: a.filename,
            Content: a.content,
            ContentType: a.contentType ?? contentTypeFor(a.filename),
          }))
        : undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Email delivery failed: ${body}`);
  }
}

export async function sendEmail({ subject, text, replyTo, attachments = [] }: SendEmailOptions) {
  const to = process.env.CONTACT_EMAIL || "info@gvcounseling.com";
  await postmarkSend(to, { subject, text, replyTo, attachments });
}

export async function sendEmailTo(to: string, options: SendEmailOptions) {
  await postmarkSend(to, options);
}
