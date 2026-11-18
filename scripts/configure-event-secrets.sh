#!/usr/bin/env bash
# Enter credentials locally; never put them in chat, shell arguments, or git.
set +x
set -euo pipefail

mode=${1:-test}
if [[ "$mode" != test && "$mode" != live ]]; then
  echo 'Usage: bash scripts/configure-event-secrets.sh [test|live]' >&2
  exit 1
fi
if [[ ! -t 0 ]]; then
  echo 'Run this script in your own interactive terminal.' >&2
  exit 1
fi
command -v firebase >/dev/null

echo "Configure Maker Bonanza credentials in makerspace-net ($mode mode)."
echo 'Blank input skips a setting. Values are hidden and sent to Secret Manager.'
echo 'This does not deploy functions or open ticket sales.'
if [[ "$mode" == live ]]; then
  echo 'Use live mode only after the test purchase, email, and refund have passed.'
fi

save_secret() {
  local name=$1 prompt=$2 value
  read -r -s -p "$prompt (Enter to skip): " value
  printf '\n'
  [[ -n "$value" ]] || return 0
  case "$name" in
    STRIPE_KEY_MAKEHAVEN)
      if [[ "$value" != "rk_${mode}_"* ]]; then
        echo "Expected a restricted $mode key starting rk_${mode}_. Nothing saved." >&2
        return 1
      fi ;;
    STRIPE_WEBHOOK_SECRET_MAKEHAVEN)
      if [[ "$value" != whsec_* ]]; then
        echo 'Expected a webhook signing secret starting whsec_. Nothing saved.' >&2
        return 1
      fi ;;
    POSTMARK_FROM_EMAIL)
      if [[ ! "$value" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
        echo 'Enter the verified sender email address without a display name. Nothing saved.' >&2
        return 1
      fi ;;
    POSTMARK_SERVER_TOKEN)
      if [[ "$value" == POSTMARK_API_TEST ]]; then
        echo 'That token does not deliver email. Enter the real server token. Nothing saved.' >&2
        return 1
      fi ;;
  esac
  printf '%s' "$value" | firebase functions:secrets:set "$name" \
    --data-file - --project makerspace-net --account jrlogan@makehaven.org --non-interactive
  unset value
}

save_secret STRIPE_KEY_MAKEHAVEN "Stripe restricted $mode API key"
save_secret STRIPE_WEBHOOK_SECRET_MAKEHAVEN "Stripe signing secret for the same $mode webhook"
save_secret POSTMARK_SERVER_TOKEN 'Postmark server API token'
save_secret POSTMARK_FROM_EMAIL 'Postmark verified sender email'
echo 'Entered settings saved. Deploy the corresponding functions before testing.'
