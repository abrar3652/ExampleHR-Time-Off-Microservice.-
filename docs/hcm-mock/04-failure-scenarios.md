# HCM Mock — 04: Failure Scenarios

> Each scenario maps to a specific test case in /docs/08-test-strategy.md.
> Every scenario is activatable via the `/__control/behavior` API.

---

## FS-1: Timeout (No Response)

**Activation:** `{ "endpoint": "deduct", "behavior": "timeout", "count": 1 }`

**What happens:**
- HCM receives the request
- Waits 10 seconds
- Closes the connection without sending a response

**ReadyOn expected behavior:**
- 8s timeout fires
- Request stays PENDING_HCM
- Outbox schedules retry (attempt 1 → 2)
- `request_audit_log` entry written with reason `HCM_TIMEOUT`

**Test validates:**
- After timeout: `time_off_request.state = PENDING_HCM`
- Outbox record `status = PENDING, attempts = 1`
- `pending_days` NOT restored (request still in-flight)

---

## FS-2: Server Error (500)

**Activation:** `{ "endpoint": "deduct", "behavior": "500", "count": 3 }`

**What happens:**
- HCM returns `HTTP 500 Internal Server Error` on the next 3 calls

**ReadyOn expected behavior:**
- Outbox retries up to 3 times
- After 3rd failure: `state = FAILED`, `pending_days` restored

**Test validates:**
- 3 calls made to HCM (verified via call log)
- Final state: `FAILED`
- `pending_days = 0`, `used_days` unchanged

---

## FS-3: Silent Success (Returns 200 But Doesn't Apply)

**Activation:** `{ "endpoint": "deduct", "behavior": "silent_success", "count": 1 }`

**What happens:**
- HCM returns `200` with valid response body
- BUT `hcm_balance.used_days` is NOT updated
- `hcm_transaction` written with `status = SILENT_FAILED`

**ReadyOn expected behavior:**
- OutboxProcessor sees 200 → moves request to `APPROVED`
- Updates local `used_days` based on HCM response (it trusts the 200)
- Balance drift created: local shows deduction, HCM does not
- Next reconciliation run detects drift: logs to `reconciliation_log`

**Test validates:**
- `time_off_request.state = APPROVED` (ReadyOn trusted the 200)
- `reconciliation_log` has a drift entry for this employee+location+leaveType
- After reconciliation auto-corrects (if conditions met): balance restored

**Purpose:** Tests that ReadyOn's reconciliation catches cases where HCM silently fails.

---

## FS-4: Unreliable Balance Validation (Returns 200 on Overdraft)

**Activation:** `{ "endpoint": "deduct", "behavior": "invalid_validation", "count": -1 }`

**What happens:**
- HCM skips the balance check
- Returns `200` even when `days > available_days`

**ReadyOn expected behavior:**
- ReadyOn's own pre-check (running before outbox) catches insufficient balance → returns 422
- HCM is never called (request rejected locally)

**Test validates:**
- Request with `daysRequested > availableDays` is rejected with `422`
- HCM call log shows 0 deduct calls (local check prevented the call)

**Purpose:** Proves ReadyOn does not rely solely on HCM for balance validation (C9).

---

## FS-5: Duplicate externalRef (409)

**Activation:** Natural — just call deduct twice with the same `externalRef`

**What happens:**
- First call: `200`, deduction applied
- Second call: `409 DUPLICATE_EXTERNAL_REF`

**ReadyOn expected behavior:**
- Outbox processor treats 409 as success
- `state = APPROVED`
- Balance updated as if the original deduction succeeded

**Test validates:**
- Request APPROVED after 409 response
- `hcm_balance.used_days` not double-deducted (HCM correctly blocked the second deduct)
- `request_audit_log` shows `APPROVED` with metadata noting 409 treated as success

---

## FS-6: Slow Response (Near Timeout Boundary)

**Activation:** `{ "endpoint": "deduct", "behavior": "slow", "count": 1 }`

**Delay:** 6000ms–7000ms (under ReadyOn's 8s timeout)

**ReadyOn expected behavior:**
- Request eventually succeeds (no timeout)
- State moves to APPROVED after ~6-7 seconds

**Test validates:**
- Request ultimately APPROVED
- Outbox processes without triggering retry
- `pending_days` correctly resolves

---

## FS-7: HCM Unavailable for Balance Read

**Activation:** `{ "endpoint": "balance_get", "behavior": "500", "count": -1 }`

**What happens:**
- All `GET /api/hcm/balance` calls return 500

**ReadyOn expected behavior (two sub-scenarios):**

**Sub-scenario A: Fresh cache (< 5 min)**
- Returns cached balance with 200
- Logs warning about HCM unavailability

**Sub-scenario B: Stale cache (> 5 min)**
- Returns 503 `BALANCE_UNVERIFIABLE`
- No new requests accepted

**Test validates:**
- Fresh cache: API returns 200 with cached data
- Stale cache: API returns 503

---

## FS-8: Reversal Failure

**Activation:** `{ "endpoint": "reverse", "behavior": "500", "count": 3 }`

**What happens:**
- Employee cancels an APPROVED request
- All reversal attempts fail with 500

**ReadyOn expected behavior:**
- `HCM_REVERSE` outbox retries 3 times
- After 3 failures: `state = FAILED` (reversal failed)
- `reconciliation_log` flagged for manual intervention
- `used_days` NOT restored (since reversal didn't succeed at HCM)

**Test validates:**
- State = FAILED after 3 reversal attempts
- `used_days` unchanged (not optimistically restored)
- `reconciliation_log` has an entry for this discrepancy

---

## FS-9: Network Error (Connection Refused)

**Activation:** Stop the Mock HCM process entirely

**What happens:**
- All HCM calls throw `ECONNREFUSED`

**ReadyOn expected behavior:**
- Treated same as 500 — outbox retries
- Balance reads with stale cache → 503

**Test validates:**
- ReadyOn does not crash
- Graceful degradation: fresh requests 503, cached reads proceed

---

## FS-10: Batch with Mixed Old/New Timestamps

**Activation:** Use `/__control/advance-clock` to produce past `last_updated_at` values for some records, normal timestamps for others

**What happens:**
- Batch contains 100 records; 50 have older timestamps than ReadyOn's local data

**ReadyOn expected behavior:**
- 50 records with newer timestamps: applied
- 50 records with older/equal timestamps: skipped
- No data corruption for either set

**Test validates:**
- Skipped count = 50
- Local records with newer local timestamps are unchanged
- `balance_change_log` has exactly 50 new entries (for the applied ones)
