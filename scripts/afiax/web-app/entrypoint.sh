#!/bin/sh
# Writes this environment's settings into the built app, then starts nginx.
set -eu
: "${MEDPLUM_BASE_URL:?MEDPLUM_BASE_URL must be set (the Afiax FHIR server)}"
case "$MEDPLUM_BASE_URL" in
  *api.medplum.com*) echo "Refusing to start: patient data must stay on Afiax servers" >&2; exit 1 ;;
esac
: "${MEDPLUM_PROJECT_ID:=}"
: "${MEDPLUM_CLIENT_ID:=}"
: "${MEDPLUM_ADMIN_APP_URL:=}"
: "${MEDPLUM_SUPPORT_EMAIL:=}"
: "${GOOGLE_CLIENT_ID:=}"
: "${RECAPTCHA_SITE_KEY:=}"
find /usr/share/nginx/html -type f \( -name '*.js' -o -name '*.html' \) -exec sed -i \
  -e "s|__MEDPLUM_BASE_URL__|${MEDPLUM_BASE_URL}|g" \
  -e "s|__MEDPLUM_PROJECT_ID__|${MEDPLUM_PROJECT_ID}|g" \
  -e "s|__MEDPLUM_CLIENT_ID__|${MEDPLUM_CLIENT_ID}|g" \
  -e "s|__MEDPLUM_ADMIN_APP_URL__|${MEDPLUM_ADMIN_APP_URL}|g" \
  -e "s|__MEDPLUM_SUPPORT_EMAIL__|${MEDPLUM_SUPPORT_EMAIL}|g" \
  -e "s|__GOOGLE_CLIENT_ID__|${GOOGLE_CLIENT_ID}|g" \
  -e "s|__RECAPTCHA_SITE_KEY__|${RECAPTCHA_SITE_KEY}|g" \
  {} +
exec nginx -g 'daemon off;'
