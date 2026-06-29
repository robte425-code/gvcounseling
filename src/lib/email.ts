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

const DEFAULT_CONTACT_EMAIL = "ghim@gvcounseling.com";
const DEFAULT_EMAIL_FROM = "Grandview Counseling <ghim@gvcounseling.com>";

function envOrDefault(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function formatPostmarkError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { Message?: string };
    const message = parsed.Message ?? body;
    if (/sender signature/i.test(message)) {
      return (
        "Email could not be sent because the configured From address is not verified in Postmark. " +
        "Set EMAIL_FROM in Vercel to a verified sender, or verify the address/domain in Postmark."
      );
    }
    return `Email delivery failed: ${message}`;
  } catch {
    return `Email delivery failed: ${body}`;
  }
}

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
  const serverToken = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const from = envOrDefault("EMAIL_FROM", DEFAULT_EMAIL_FROM);

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
    throw new Error(formatPostmarkError(body));
  }
}

export async function sendEmail({ subject, text, replyTo, attachments = [] }: SendEmailOptions) {
  const to = envOrDefault("CONTACT_EMAIL", DEFAULT_CONTACT_EMAIL);
  await postmarkSend(to, { subject, text, replyTo, attachments });
}

export async function sendEmailTo(to: string, options: SendEmailOptions) {
  await postmarkSend(to, options);
}
