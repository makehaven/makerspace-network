#!/bin/sh
# Runs a command with throwaway Stripe and Postmark settings for the Functions
# emulator, restoring whatever local settings were there before. Both files are
# gitignored and read only by the emulator. STRIPE_API_BASE is ignored outside
# the emulator (functions/src/events.ts).
cd "$(dirname "$0")/.." || exit 1
for f in functions/.secret.local functions/.env.local; do [ -f "$f" ] && mv "$f" "$f.keep"; done
cat > functions/.secret.local <<S
STRIPE_KEY_MAKEHAVEN=sk_test_fake
STRIPE_WEBHOOK_SECRET_MAKEHAVEN=whsec_test
POSTMARK_SERVER_TOKEN=POSTMARK_API_TEST
POSTMARK_FROM_EMAIL=test@example.org
GROUP_REPLY_KEY_SECRET=test
POSTMARK_INBOUND_WEBHOOK_SECRET=test-inbound-secret
S
echo 'STRIPE_API_BASE=http://127.0.0.1:5199' > functions/.env.local
"$@"; code=$?
rm -f functions/.secret.local functions/.env.local
for f in functions/.secret.local functions/.env.local; do [ -f "$f.keep" ] && mv "$f.keep" "$f"; done
exit $code
