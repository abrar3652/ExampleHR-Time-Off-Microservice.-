#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HCM_PID=""
TIMEOFF_PID=""
FAILED_STEP=""

cleanup() {
  if [[ -n "${TIMEOFF_PID}" ]] && kill -0 "${TIMEOFF_PID}" 2>/dev/null; then
    kill "${TIMEOFF_PID}" 2>/dev/null || true
  fi
  if [[ -n "${HCM_PID}" ]] && kill -0 "${HCM_PID}" 2>/dev/null; then
    kill "${HCM_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

fail_step() {
  FAILED_STEP="$1"
  echo "DEMO FAILED: ${FAILED_STEP}"
  exit 1
}

gen_uuid() {
  if command -v uuidgen >/dev/null 2>&1; then
    uuidgen
  else
    python - <<'PY'
import uuid
print(uuid.uuid4())
PY
  fi
}

call_api() {
  local method="$1"
  local url="$2"
  local headers="$3"
  local data="${4:-}"
  local tmp
  tmp="$(mktemp)"
  local status

  if [[ -n "${data}" ]]; then
    status=$(bash -c "curl -sS -o \"$tmp\" -w '%{http_code}' -X \"$method\" \"$url\" $headers -d '$data'")
  else
    status=$(bash -c "curl -sS -o \"$tmp\" -w '%{http_code}' -X \"$method\" \"$url\" $headers")
  fi

  local body
  body="$(cat "$tmp")"
  rm -f "$tmp"
  printf '%s\n%s' "$status" "$body"
}

wait_for_health() {
  local timeout=30
  local start
  start="$(date +%s)"
  while true; do
    local now
    now="$(date +%s)"
    if (( now - start > timeout )); then
      return 1
    fi
    local status
    status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/health || true)"
    if [[ "$status" == "200" ]]; then
      return 0
    fi
    sleep 1
  done
}

echo "Starting hcm-mock in background..."
(
  cd "${ROOT_DIR}/apps/hcm-mock" || exit 1
  npm run start:prod >/dev/null 2>&1 || (npm run build >/dev/null 2>&1 && node dist/main.js >/dev/null 2>&1)
) &
HCM_PID=$!

echo "Starting time-off-service in background..."
(
  cd "${ROOT_DIR}/apps/time-off-service" || exit 1
  npm run start:prod >/dev/null 2>&1 || (npm run build >/dev/null 2>&1 && node dist/src/main.js >/dev/null 2>&1)
) &
TIMEOFF_PID=$!

echo "Waiting for /health on time-off-service..."
if ! wait_for_health; then
  fail_step "service startup"
fi

echo
echo "STEP 1: Seed a balance in Mock HCM"
STEP1="$(call_api "POST" "http://localhost:4000/__control/balance" \
  "-H \"Content-Type: application/json\"" \
  "{\"employeeId\":\"demo-emp\",\"locationId\":\"loc-nyc\",\"leaveType\":\"ANNUAL\",\"totalDays\":10,\"usedDays\":0,\"hcmLastUpdatedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}")"
STEP1_STATUS="$(printf '%s' "$STEP1" | head -n1)"
STEP1_BODY="$(printf '%s' "$STEP1" | tail -n +2)"
echo "$STEP1_BODY"
[[ "$STEP1_STATUS" == "200" || "$STEP1_STATUS" == "201" ]] || fail_step "STEP 1"

echo
echo "STEP 2: Submit a time-off request"
IDEMP1="$(gen_uuid)"
STEP2="$(call_api "POST" "http://localhost:3000/time-off/requests" \
  "-H \"Content-Type: application/json\" -H \"Idempotency-Key: ${IDEMP1}\" -H \"X-Employee-Id: demo-emp\"" \
  '{"locationId":"loc-nyc","leaveType":"ANNUAL","startDate":"2025-06-02","endDate":"2025-06-04","daysRequested":3,"note":"Demo"}')"
STEP2_STATUS="$(printf '%s' "$STEP2" | head -n1)"
STEP2_BODY="$(printf '%s' "$STEP2" | tail -n +2)"
echo "$STEP2_BODY"
[[ "$STEP2_STATUS" == "202" ]] || fail_step "STEP 2"
REQ1_ID="$(printf '%s' "$STEP2_BODY" | python -c 'import json,sys; print(json.loads(sys.stdin.read()).get("requestId",""))')"
[[ -n "$REQ1_ID" ]] || fail_step "STEP 2 requestId parse"

echo
echo "STEP 3: Wait 3 seconds for outbox to process"
sleep 3

echo
echo "STEP 4: Check request state (must be APPROVED)"
STEP4="$(call_api "GET" "http://localhost:3000/time-off/requests/${REQ1_ID}" \
  "-H \"X-Employee-Id: demo-emp\"")"
STEP4_STATUS="$(printf '%s' "$STEP4" | head -n1)"
STEP4_BODY="$(printf '%s' "$STEP4" | tail -n +2)"
echo "$STEP4_BODY"
[[ "$STEP4_STATUS" == "200" ]] || fail_step "STEP 4"
REQ1_STATE="$(printf '%s' "$STEP4_BODY" | python -c 'import json,sys; print(json.loads(sys.stdin.read()).get("state",""))')"
[[ "$REQ1_STATE" == "APPROVED" ]] || fail_step "STEP 4 state"

echo
echo "STEP 5: Check balance (availableDays should be 7)"
STEP5="$(call_api "GET" "http://localhost:3000/balances/demo-emp/loc-nyc/ANNUAL" \
  "-H \"X-Employee-Id: demo-emp\"")"
STEP5_STATUS="$(printf '%s' "$STEP5" | head -n1)"
STEP5_BODY="$(printf '%s' "$STEP5" | tail -n +2)"
echo "$STEP5_BODY"
[[ "$STEP5_STATUS" == "200" ]] || fail_step "STEP 5"
AVAILABLE="$(printf '%s' "$STEP5_BODY" | python -c 'import json,sys; print(json.loads(sys.stdin.read()).get("availableDays",""))')"
[[ "$AVAILABLE" == "7" || "$AVAILABLE" == "7.0" ]] || fail_step "STEP 5 availableDays"

echo
echo "STEP 6: Trigger HCM chaos (next deduct returns 500 twice)"
STEP6="$(call_api "POST" "http://localhost:4000/__control/behavior" \
  "-H \"Content-Type: application/json\"" \
  '{"endpoint":"deduct","behavior":"500","count":2}')"
STEP6_STATUS="$(printf '%s' "$STEP6" | head -n1)"
STEP6_BODY="$(printf '%s' "$STEP6" | tail -n +2)"
echo "$STEP6_BODY"
[[ "$STEP6_STATUS" == "200" || "$STEP6_STATUS" == "201" ]] || fail_step "STEP 6"

echo
echo "STEP 7: Submit another request (will retry twice then succeed)"
IDEMP2="$(gen_uuid)"
STEP7="$(call_api "POST" "http://localhost:3000/time-off/requests" \
  "-H \"Content-Type: application/json\" -H \"Idempotency-Key: ${IDEMP2}\" -H \"X-Employee-Id: demo-emp\"" \
  '{"locationId":"loc-nyc","leaveType":"ANNUAL","startDate":"2025-07-04","endDate":"2025-07-05","daysRequested":1,"note":"Chaos demo"}')"
STEP7_STATUS="$(printf '%s' "$STEP7" | head -n1)"
STEP7_BODY="$(printf '%s' "$STEP7" | tail -n +2)"
echo "$STEP7_BODY"
[[ "$STEP7_STATUS" == "202" ]] || fail_step "STEP 7"
REQ2_ID="$(printf '%s' "$STEP7_BODY" | python -c 'import json,sys; print(json.loads(sys.stdin.read()).get("requestId",""))')"
[[ -n "$REQ2_ID" ]] || fail_step "STEP 7 requestId parse"

echo
echo "STEP 8: Wait 15 seconds (covers 2 retries with backoff)"
sleep 15

echo
echo "STEP 9: Check request state (must be APPROVED despite 2 HCM failures)"
STEP9="$(call_api "GET" "http://localhost:3000/time-off/requests/${REQ2_ID}" \
  "-H \"X-Employee-Id: demo-emp\"")"
STEP9_STATUS="$(printf '%s' "$STEP9" | head -n1)"
STEP9_BODY="$(printf '%s' "$STEP9" | tail -n +2)"
echo "$STEP9_BODY"
[[ "$STEP9_STATUS" == "200" ]] || fail_step "STEP 9"
REQ2_STATE="$(printf '%s' "$STEP9_BODY" | python -c 'import json,sys; print(json.loads(sys.stdin.read()).get("state",""))')"
[[ "$REQ2_STATE" == "APPROVED" ]] || fail_step "STEP 9 state"

echo
echo "STEP 10: Check HCM call log (must show >=3 deduct calls for second request)"
STEP10="$(call_api "GET" "http://localhost:4000/__control/call-log" "")"
STEP10_STATUS="$(printf '%s' "$STEP10" | head -n1)"
STEP10_BODY="$(printf '%s' "$STEP10" | tail -n +2)"
echo "$STEP10_BODY"
[[ "$STEP10_STATUS" == "200" ]] || fail_step "STEP 10"
DEDUCT_COUNT="$(printf '%s' "$STEP10_BODY" | python -c 'import json,sys; d=json.loads(sys.stdin.read()); print(sum(1 for x in d if x.get("endpoint")=="deduct"))')"
[[ "$DEDUCT_COUNT" -ge 3 ]] || fail_step "STEP 10 deduct call count"

echo
echo "STEP 11: Check health endpoint"
STEP11="$(call_api "GET" "http://localhost:3000/health" "")"
STEP11_STATUS="$(printf '%s' "$STEP11" | head -n1)"
STEP11_BODY="$(printf '%s' "$STEP11" | tail -n +2)"
echo "$STEP11_BODY"
[[ "$STEP11_STATUS" == "200" ]] || fail_step "STEP 11"

echo
echo "DEMO COMPLETE"
