#!/usr/bin/env bash
# kenya-preflight.sh — Kenya production cutover pre-flight verification
#
# Usage:
#   MEDPLUM_BASE_URL=https://api.your-host.com \
#   MEDPLUM_CLIENT_ID=<client-id> \
#   MEDPLUM_CLIENT_SECRET=<client-secret> \
#   PROJECT_ID=<project-id> \
#   ./kenya-preflight.sh
#
# Optional:
#   SKIP_INFRA=1   — skip Kubernetes/infrastructure checks (for non-k8s deployments)
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed (details printed to stderr)
#
# This script covers the machine-testable items from
# compliance/runbooks/00-production-cutover-checklist.md
# Human-verification items are printed as reminders but not tested.

set -euo pipefail

MEDPLUM_BASE_URL="${MEDPLUM_BASE_URL:?Set MEDPLUM_BASE_URL}"
MEDPLUM_CLIENT_ID="${MEDPLUM_CLIENT_ID:?Set MEDPLUM_CLIENT_ID}"
MEDPLUM_CLIENT_SECRET="${MEDPLUM_CLIENT_SECRET:?Set MEDPLUM_CLIENT_SECRET}"
PROJECT_ID="${PROJECT_ID:?Set PROJECT_ID}"
SKIP_INFRA="${SKIP_INFRA:-0}"

PASS=0
FAIL=0
WARN=0

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; ((PASS++)) || true; }
fail() { echo -e "  ${RED}✗${NC} $1" >&2; ((FAIL++)) || true; }
warn() { echo -e "  ${YELLOW}!${NC} $1"; ((WARN++)) || true; }
section() { echo ""; echo "=== $1 ==="; }

# ---------------------------------------------------------------------------
# Authenticate
# ---------------------------------------------------------------------------
section "Authenticating to Medplum"

TOKEN_RESPONSE=$(curl -sf -X POST "${MEDPLUM_BASE_URL}/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=${MEDPLUM_CLIENT_ID}&client_secret=${MEDPLUM_CLIENT_SECRET}" \
  2>/dev/null) || { fail "Could not reach ${MEDPLUM_BASE_URL}/oauth2/token"; exit 1; }

ACCESS_TOKEN=$(echo "${TOKEN_RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null) || {
  fail "Failed to parse access token from response"
  exit 1
}
pass "Authenticated to ${MEDPLUM_BASE_URL}"

fhir_get() {
  curl -sf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H "X-Medplum-Project: ${PROJECT_ID}" \
    "${MEDPLUM_BASE_URL}/fhir/R4/$1" 2>/dev/null
}

admin_get() {
  curl -sf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    "${MEDPLUM_BASE_URL}/admin/projects/${PROJECT_ID}/$1" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Project settings
# ---------------------------------------------------------------------------
section "Project settings"

PROJECT_JSON=$(curl -sf -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  "${MEDPLUM_BASE_URL}/admin/projects/${PROJECT_ID}" 2>/dev/null) || {
  fail "Could not load project ${PROJECT_ID}"
  exit 1
}

get_setting() {
  echo "${PROJECT_JSON}" | python3 -c \
    "import sys,json; s=json.load(sys.stdin).get('setting',[]); v=[x.get('valueString','') for x in s if x.get('name')=='$1']; print(v[0] if v else '')" 2>/dev/null
}

COUNTRY_PACK=$(get_setting "countryPack")
if [ "${COUNTRY_PACK}" = "kenya" ]; then
  pass "countryPack = kenya"
else
  fail "countryPack = '${COUNTRY_PACK}' (expected: kenya)"
fi

HIE_ENV=$(get_setting "kenyaHieEnvironment")
if [ "${HIE_ENV}" = "production" ]; then
  pass "kenyaHieEnvironment = production"
elif [ "${HIE_ENV}" = "uat" ]; then
  warn "kenyaHieEnvironment = uat — confirm this is intentional for production cutover"
else
  fail "kenyaHieEnvironment = '${HIE_ENV}' (expected: production or uat)"
fi

SHA_ENV=$(get_setting "kenyaShaClaimsEnvironment")
if [ "${SHA_ENV}" = "production" ]; then
  pass "kenyaShaClaimsEnvironment = production"
elif [ "${SHA_ENV}" = "uat" ]; then
  warn "kenyaShaClaimsEnvironment = uat — confirm this is intentional for production cutover"
else
  fail "kenyaShaClaimsEnvironment = '${SHA_ENV}' (expected: production or uat)"
fi

HIE_AGENT=$(get_setting "kenyaHieAgentId")
if [ -n "${HIE_AGENT}" ]; then
  pass "kenyaHieAgentId is set"
else
  fail "kenyaHieAgentId is not set (required for AfyaLink v3 client registry)"
fi

HIE_CRED_MODE=$(get_setting "kenyaHieCredentialMode")
if [ -n "${HIE_CRED_MODE}" ]; then
  pass "kenyaHieCredentialMode = ${HIE_CRED_MODE}"
else
  fail "kenyaHieCredentialMode is not set"
fi

SHA_CRED_MODE=$(get_setting "kenyaShaClaimsCredentialMode")
if [ -n "${SHA_CRED_MODE}" ]; then
  pass "kenyaShaClaimsCredentialMode = ${SHA_CRED_MODE}"
else
  fail "kenyaShaClaimsCredentialMode is not set"
fi

KHIS_BOT=$(get_setting "kenyaKhisSchedulerBotId")
if [ -n "${KHIS_BOT}" ]; then
  pass "kenyaKhisSchedulerBotId is set: ${KHIS_BOT}"
else
  warn "kenyaKhisSchedulerBotId not set — KHIS scheduler has not been provisioned"
fi

# Check cron feature
HAS_CRON=$(echo "${PROJECT_JSON}" | python3 -c \
  "import sys,json; f=json.load(sys.stdin).get('features',[]); print('yes' if 'cron' in f else 'no')" 2>/dev/null)
if [ "${HAS_CRON}" = "yes" ]; then
  pass "project.features includes 'cron'"
else
  warn "project.features does not include 'cron' — KHIS scheduler will not run"
fi

# ---------------------------------------------------------------------------
# HIE connectivity
# ---------------------------------------------------------------------------
section "HIE connectivity"

HIE_TEST=$(curl -sf -X POST \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Medplum-Project: ${PROJECT_ID}" \
  -H "Content-Type: application/json" \
  -d '{}' \
  "${MEDPLUM_BASE_URL}/admin/projects/${PROJECT_ID}/kenya/afyalink/test" 2>/dev/null) || HIE_TEST=""

if echo "${HIE_TEST}" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') or d.get('status')=='ok' else 1)" 2>/dev/null; then
  pass "AfyaLink HIE test connection succeeded"
else
  fail "AfyaLink HIE test connection failed — check credentials and environment"
  if [ -n "${HIE_TEST}" ]; then
    echo "    Response: ${HIE_TEST}" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Verified facilities
# ---------------------------------------------------------------------------
section "Facility and practitioner verification"

ORG_COUNT=$(fhir_get "Organization?_count=1" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")
if [ "${ORG_COUNT}" -gt "0" ]; then
  pass "At least one Organization exists (${ORG_COUNT})"
else
  fail "No Organizations found — at least one Kenya facility must be onboarded"
fi

PRAC_COUNT=$(fhir_get "Practitioner?_count=1" | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('total',0))" 2>/dev/null || echo "0")
if [ "${PRAC_COUNT}" -gt "0" ]; then
  pass "At least one Practitioner exists (${PRAC_COUNT})"
else
  fail "No Practitioners found — at least one Kenya practitioner must be verified"
fi

# ---------------------------------------------------------------------------
# SHA callback endpoint
# ---------------------------------------------------------------------------
section "SHA callback endpoint"

CALLBACK_URL="${MEDPLUM_BASE_URL}/kenya/sha-callback/${PROJECT_ID}"

# Send a synthetic test payload — expect ok:true or ok:false (bundleId won't match, that's fine)
CALLBACK_RESPONSE=$(curl -sf -X POST "${CALLBACK_URL}" \
  -H "Content-Type: application/json" \
  -d '{"bundleId":"preflight-test-bundle","claimState":"test"}' 2>/dev/null) || CALLBACK_RESPONSE=""

if echo "${CALLBACK_RESPONSE}" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'ok' in d else 1)" 2>/dev/null; then
  pass "SHA callback endpoint is reachable at ${CALLBACK_URL}"
else
  fail "SHA callback endpoint did not respond as expected at ${CALLBACK_URL}"
  if [ -n "${CALLBACK_RESPONSE}" ]; then
    echo "    Response: ${CALLBACK_RESPONSE}" >&2
  fi
fi

# ---------------------------------------------------------------------------
# AuditEvent tamper-proof check
# ---------------------------------------------------------------------------
section "Audit trail"

AUDIT_DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -X DELETE \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Medplum-Project: ${PROJECT_ID}" \
  "${MEDPLUM_BASE_URL}/fhir/R4/AuditEvent/preflight-test-id" 2>/dev/null)

if [ "${AUDIT_DELETE_STATUS}" = "405" ]; then
  pass "AuditEvent DELETE returns 405 Method Not Allowed (tamper-proof)"
elif [ "${AUDIT_DELETE_STATUS}" = "404" ]; then
  warn "AuditEvent DELETE returned 404 — resource not found, but DELETE was accepted. Verify AuditEvent deletion is disabled."
else
  fail "AuditEvent DELETE returned ${AUDIT_DELETE_STATUS} (expected 405)"
fi

# ---------------------------------------------------------------------------
# Infrastructure checks (skippable)
# ---------------------------------------------------------------------------
if [ "${SKIP_INFRA}" = "0" ]; then
  section "Infrastructure (kubectl)"
  if command -v kubectl &>/dev/null; then
    UNHEALTHY_NODES=$(kubectl get nodes --no-headers 2>/dev/null | grep -v ' Ready ' | wc -l || echo "unknown")
    if [ "${UNHEALTHY_NODES}" = "0" ]; then
      pass "All Kubernetes nodes are Ready"
    else
      fail "${UNHEALTHY_NODES} Kubernetes node(s) are not Ready"
    fi
  else
    warn "kubectl not found — skipping infrastructure checks (set SKIP_INFRA=1 to suppress this warning)"
  fi
fi

# ---------------------------------------------------------------------------
# Human reminders
# ---------------------------------------------------------------------------
section "Human verification required (not automated)"
echo "  ! DHA API endpoint verification (GitHub issue #4):"
echo "      - Confirm /v1/shr/patient-record is the correct SHR outpatient submission path"
echo "      - Confirm /v2/facility-search?facility_code=... works (docs show facility-fid on v2)"
echo "      - Do not use SHR publication in production until confirmed with DHA"
echo "  ! Credentials have been rotated from UAT values (see runbook 01)"
echo "  ! SHA Claims callback URL is registered in the SHA portal"
echo "  ! At least one admin user has MFA enabled"
echo "  ! Break-glass flow tested end-to-end"
echo "  ! DNS TTL lowered before cutover"
echo "  ! Rollback owner identified and reachable"
echo "  ! DPO sign-off on cutover checklist obtained"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
section "Summary"
TOTAL=$((PASS + FAIL + WARN))
echo "  Automated checks: ${TOTAL} total — ${PASS} passed, ${FAIL} failed, ${WARN} warnings"

if [ "${FAIL}" -gt "0" ]; then
  echo -e "  ${RED}PRE-FLIGHT FAILED — resolve ${FAIL} failure(s) before cutover${NC}"
  exit 1
elif [ "${WARN}" -gt "0" ]; then
  echo -e "  ${YELLOW}PRE-FLIGHT PASSED WITH WARNINGS — review ${WARN} warning(s)${NC}"
  exit 0
else
  echo -e "  ${GREEN}PRE-FLIGHT PASSED — automated checks complete${NC}"
  exit 0
fi
