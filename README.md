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

Contact and referral forms send email via the Postmark API. Referral uploads are stored in Google Drive; admin notification emails include form details only (not file attachments). If `POSTMARK_SERVER_TOKEN` is not set, forms will show a configuration error until environment variables are added.

## Billing portal (Phase 1)

Therapists and admin sign in at **`/portal/login`**.

### Setup

1. Create a PostgreSQL database (e.g. [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres)).
2. Copy `.env.example` to `.env` and set:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Random secret (`openssl rand -base64 32`) |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client ID (Drive import and invoice attachments) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | OAuth callback URL (must match Google Cloud console) |
| `DRIVE_TOKEN_ENCRYPTION_KEY` | 32-byte key for encrypting Drive OAuth tokens at rest (`openssl rand -base64 32`) |

3. Run migrations and seed users:

```bash
npx prisma migrate dev --name init
npm run db:seed
```

The seed script prints one-time passwords for `ghim@gvcounseling.com`, `maria@gvcounseling.com`, and `steven@gvcounseling.com`. All users must change password on first login.

### Portal features

- **Admin:** pay periods, client registry, Referral Submission (.docx) import, CSV import, invoice queue, generate consolidated **837 EDI** bill, bill history
- **Therapists:** create/edit/submit invoices, un-submit before billing, attach PDFs to the client’s Google Drive folder, view billed invoices

### Referral Submission import

**Google Drive (recommended):** Admin → Clients → Import → **Connect Google Drive**, then **Sync from Drive**. Therapists can connect their own Google account under **Integrations** and sync their client folder only. When Maria or Steven have connected Drive, bulk sync uses their credentials for their respective folders. Reads `Maria: Client files` and `Steven: Client files`, finds each `<claim #> - <client name>` folder, exports the **Referral Submission** Google Doc, and parses **Claim Status / CAC** and **Addresses & Contacts** PDFs (with OCR fallback for scans). Creates or updates clients by claim number. Use **Re-sync from Drive** on a client detail page to refresh one folder. BHI approval and medical note PDFs are not imported.

Set `GOOGLE_CLOUD_VISION_API_KEY` (Cloud Vision API enabled in your Google Cloud project) for OCR on scanned PDFs.

**Manual upload:** Upload `.docx` files from client folders. The parser extracts NPI, diagnoses (tolerates label misspellings), claim number, client name, DOB, gender, and VRC contact info.

### 837 generation

Admin selects a pay period cutoff → **Generate 837** combines all submitted invoices (on or before cutoff) into one L&I upload file modeled on your Team Vocational sample. Invoices are marked **Billed** and locked.

### Critical-fix smoke tests

After deploying security/billing fixes, run:

```bash
# Local logic only (no production HTTP / DB)
AUTH_SECRET=... DRIVE_TOKEN_ENCRYPTION_KEY=... npm run smoke:critical-fixes

# Production HTTP checks (validation only — no intake emails)
npm run smoke:critical-fixes -- --remote

# Rate-limit checks against production (no emails) — requires shared secret:
#   1. openssl rand -base64 32  → add as SMOKE_TEST_SECRET in Vercel (Production)
#   2. export SMOKE_TEST_SECRET=... locally, then:
SMOKE_TEST_SECRET=... npm run smoke:critical-fixes -- --remote

# DB checks (rate limit table, Drive token encryption, BILLED+CLM)
DATABASE_URL=... npm run smoke:critical-fixes -- --db

# Full suite
AUTH_SECRET=... DRIVE_TOKEN_ENCRYPTION_KEY=... DATABASE_URL=... SMOKE_TEST_SECRET=... \
  npm run smoke:critical-fixes -- --all
```

Exits non-zero if any test fails.

#### Pulling credentials from Vercel

1. Install the [Vercel CLI](https://vercel.com/docs/cli) and run `vercel login`.
2. In the project directory: `vercel link` (select the **gvcounseling** project).
3. Pull env vars into a local file (do not commit): `vercel env pull .env.smoke.local`
4. Run smoke tests with that file:

```bash
set -a && source .env.smoke.local && set +a
npm run smoke:critical-fixes -- --all
```

Or copy individual values from **Vercel → gvcounseling → Settings → Environment Variables**:

| Variable | Where to find it |
|----------|------------------|
| `DATABASE_URL` | Often `POSTGRES_URL` or `DATABASE_URL` from the Neon integration |
| `DATABASE_URL_UNPOOLED` | Direct URL for migrations; use either this or `DATABASE_URL` for `--db` smoke checks |
| `AUTH_SECRET` | Environment Variables (used by NextAuth) |
| `DRIVE_TOKEN_ENCRYPTION_KEY` | Environment Variables — add with `openssl rand -base64 32` if missing |
| `SMOKE_TEST_SECRET` | Add yourself (`openssl rand -base64 32`) — redeploy after adding |
