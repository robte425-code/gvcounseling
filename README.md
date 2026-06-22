# Grandview Counseling

Modern website for [Grandview Counseling](https://gvcounseling.com), rebuilt with Next.js for deployment on Vercel.

## Pages

- **What we do** — Home page with services overview
- **Our team** — Therapist profiles
- **Contact us** — Contact form and office information
- **Refer a client** — VRC referral form with file uploads
- **Privacy Statement**, **Terms of use**, **Accessibility**

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repository to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Add environment variables for form submissions:

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | API key from [Resend](https://resend.com) |
| `CONTACT_EMAIL` | Inbox for form submissions (e.g. `info@gvcounseling.com`) |
| `EMAIL_FROM` | Verified sender address in Resend (e.g. `Grandview Counseling <noreply@gvcounseling.com>`) |

4. Deploy. Vercel will build and host the site automatically.

## Connect your domain

After deploying, add `gvcounseling.com` and `www.gvcounseling.com` in your Vercel project under **Settings → Domains**. Update DNS at your registrar to point to Vercel, then remove or redirect the old Wix site once verified.

## Forms

Contact and referral forms send email via the Resend API. File attachments on the referral form are included in the notification email. If `RESEND_API_KEY` is not set, forms will show a configuration error until environment variables are added.
