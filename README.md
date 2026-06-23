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
| `POSTMARK_SERVER_TOKEN` | Server API token from [Postmark](https://postmarkapp.com) |
| `CONTACT_EMAIL` | Inbox for form submissions (e.g. `info@gvcounseling.com`) |
| `EMAIL_FROM` | Verified sender in Postmark (e.g. `Grandview Counseling <info@gvcounseling.com>`) |

4. Deploy. Vercel will build and host the site automatically.

## Connect your domain

After deploying, add `gvcounseling.com` and `www.gvcounseling.com` in your Vercel project under **Settings → Domains**. Update DNS at your registrar to point to Vercel, then remove or redirect the old Wix site once verified.

## Forms

Contact and referral forms send email via the Postmark API. File attachments on the referral form are included in the notification email. If `POSTMARK_SERVER_TOKEN` is not set, forms will show a configuration error until environment variables are added.

## Billing portal (Phase 1)

Therapists and admin sign in at **`/portal/login`**.

### Setup

1. Create a PostgreSQL database (e.g. [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)).
2. Copy `.env.example` to `.env` and set:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret (`openssl rand -base64 32`) |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for invoice PDF attachments |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID (Drive import) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | OAuth callback URL (must match Google Cloud console) |

3. Run migrations and seed users:

```bash
npx prisma migrate dev --name init
npm run db:seed
```

The seed script prints one-time passwords for `ghim@gvcounseling.com`, `maria@gvcounseling.com`, and `steven@gvcounseling.com`. All users must change password on first login.

### Portal features

- **Admin:** pay periods, client registry, Referral Submission (.docx) import, CSV import, invoice queue, generate consolidated **837 EDI** bill, bill history
- **Therapists:** create/edit/submit invoices, un-submit before billing, attach PDFs, view billed invoices

### Referral Submission import

**Google Drive (recommended):** Admin → Clients → Import → **Connect Google Drive**, then **Sync from Drive**. Reads `Maria: Client files` and `Steven: Client files`, finds each `<claim #> - <client name>` folder, exports the **Referral Submission** Google Doc, and creates or updates clients by claim number.

**Manual upload:** Upload `.docx` files from client folders. The parser extracts NPI, diagnoses (tolerates label misspellings), claim number, client name, DOB, gender, and VRC contact info.

### 837 generation

Admin selects a pay period cutoff → **Generate 837** combines all submitted invoices (on or before cutoff) into one L&I upload file modeled on your Team Vocational sample. Invoices are marked **Billed** and locked.
