#!/usr/bin/env bash
# Pull existing Vercel env vars and add smoke/Drive secrets.
# Requires: vercel login + vercel link (once).
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v vercel >/dev/null 2>&1; then
  echo "Installing Vercel CLI..."
  npm install -g vercel@55.0.0
fi

if ! vercel whoami >/dev/null 2>&1; then
  echo "Run: vercel login"
  echo "Then re-run: npm run setup:smoke-credentials"
  exit 1
fi

if [[ ! -f .vercel/project.json ]]; then
  echo "Linking project (select gvcounseling)..."
  vercel link --yes
fi

ENV_FILE=".env.smoke.local"
echo "Pulling production env into ${ENV_FILE}..."
vercel env pull "${ENV_FILE}" --environment=production --yes

generate_secret() {
  openssl rand -base64 32
}

add_env_if_missing() {
  local name="$1"
  local value="$2"
  if grep -q "^${name}=" "${ENV_FILE}" 2>/dev/null; then
    echo "${name} already in ${ENV_FILE} — leaving unchanged."
    return
  fi
  echo "Adding ${name} to Vercel (production) and ${ENV_FILE}..."
  printf '%s' "${value}" | vercel env add "${name}" production --yes
  printf '\n%s=%s\n' "${name}" "${value}" >> "${ENV_FILE}"
}

if ! grep -q "^DRIVE_TOKEN_ENCRYPTION_KEY=" "${ENV_FILE}" 2>/dev/null; then
  add_env_if_missing "DRIVE_TOKEN_ENCRYPTION_KEY" "$(generate_secret)"
else
  echo "DRIVE_TOKEN_ENCRYPTION_KEY already present."
fi

if ! grep -q "^SMOKE_TEST_SECRET=" "${ENV_FILE}" 2>/dev/null; then
  add_env_if_missing "SMOKE_TEST_SECRET" "$(generate_secret)"
else
  echo "SMOKE_TEST_SECRET already present."
fi

echo ""
echo "Done. ${ENV_FILE} contains DATABASE_URL, AUTH_SECRET, and smoke secrets."
echo "Run full smoke tests:"
echo "  set -a && source ${ENV_FILE} && set +a"
echo "  npm run smoke:critical-fixes -- --all"
echo ""
echo "Redeploy production in Vercel so new env vars take effect."
