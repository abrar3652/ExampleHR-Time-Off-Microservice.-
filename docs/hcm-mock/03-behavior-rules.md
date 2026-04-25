# HCM Mock — 03: Behavior Rules

> These are the EXACT rules the Mock HCM implements. Intentional imperfections are marked with ⚠️.
> Every rule here exists to stress-test ReadyOn's defensive logic.

---

## Deduction Rules

### Rule D1 — Idempotency on externalRef
- If `POST /api/hcm/timeoff/deduct` is called with an `externalRef` that already exists in `hcm_transaction`:
  - Return `409 DUPLICATE_EXTERNAL_REF` with the original `hcmTransactionId`
  - Do NOT apply a second deduction
  - This is the correct, expected behavior — ReadyOn must handle 409 as success

### Rule D2 — Balance Validation
- Before applying deduction: check `available_days = total_days - used_days`
- If `days > available_days`: return `422 INSUFFICIENT_BALANCE`
- ⚠️ **Unreliable validation mode (chaos):** When `behavior = "invalid_validation"` is active, HCM skips this check and returns 200 even when balance is insufficient. ReadyOn must catch this via its own pre-check (C9).

### Rule D3 — Atomic Apply
- On successful deduction: `used_days += days` in `hcm_balance`, `last_updated_at = hcmNow()`
- Both the `hcm_balance` update and `hcm_transaction` insert happen in the same SQLite transaction
- ⚠️ **Silent failure mode (chaos):** When `behavior = "silent_success"` is active: HCM returns `200` BUT does NOT update `hcm_balance`. The `hcm_transaction` is written with `status = SILENT_FAILED`. ReadyOn will see a successful response but reconciliation will reveal the discrepancy.

### Rule D4 — Dimension Validation
- If `(employee_id, location_id, leave_type)` has no row in `hcm_balance`: return `400 INVALID_DIMENSIONS`
- This validation is ALWAYS applied (not skipped by chaos modes)

---

## Reversal Rules

### Rule R1 — Transaction Must Exist
- `hcmTransactionId` must exist in `hcm_transaction`
- If not found: `404 TRANSACTION_NOT_FOUND`

### Rule R2 — No Double Reversal
- If `hcm_transaction.status = REVERSED`: return `409 ALREADY_REVERSED`

### Rule R3 — Silent Failure Reversals
- If `hcm_transaction.status = SILENT_FAILED`: HCM reverses the transaction record but cannot restore balance (there was nothing to deduct). Returns 200 with `restoredDays = 0`.

### Rule R4 — Apply Reversal
- `used_days -= days` in `hcm_balance`, clamped at 0
- `hcm_transaction.status = REVERSED`, `reversed_by = reversal_transaction_id`

---

## Balance Drift (Independent Updates)

### Rule B1 — Scheduled Drift
- Mock HCM has a background job that runs every 5 minutes in test mode
- It picks a random employee+location+leave_type combo and applies a drift:
  - Work anniversary: `total_days += random(1, 5)` (round to nearest 0.5)
  - Random deduction (external system): `used_days += random(0.5, 2)` (clamped to available)
- These changes are reflected in `GET /api/hcm/balance` immediately
- ReadyOn will discover them via TTL expiry or batch sync

### Rule B2 — Year Reset
- Triggered via `/__control/drift` with `reason = "year_reset"`
- Sets `used_days = 0`, `total_days = [policy default]`
- Updates `last_updated_at = hcmNow()`

---

## Response Timing Rules

### Rule T1 — Base Latency
- All real-time endpoints add a random jitter of 50ms–200ms to every response (simulates real HCM latency)

### Rule T2 — Slow Mode
- When `behavior = "slow"`: response delayed by 3000ms–6000ms
- ReadyOn's 8s timeout means slow mode should NOT trigger a timeout (tests boundary conditions)

### Rule T3 — Timeout Mode
- When `behavior = "timeout"`: no response sent for 10 seconds (exceeds ReadyOn's 8s timeout)
- After 10 seconds, connection is forcibly closed (simulates network drop, not just slow response)

---

## Batch Behavior Rules

### Rule BA1 — Batch Generation
- `GET /api/hcm/batch/balances` returns all records updated since `since` parameter (or all if no `since`)
- Records reflect `hcm_balance` state at the time of the request (snapshot)
- `generatedAt` = `hcmNow()` (uses HCM internal clock, which can be controlled)

### Rule BA2 — Stale Batch Simulation
- When `/__control/advance-clock` is called with a NEGATIVE value: `hcmNow()` returns a past timestamp
- This allows tests to produce a batch where `hcmLastUpdatedAt` is older than ReadyOn's local records
- Verifies that ReadyOn correctly skips older batch data (R6)

### Rule BA3 — Batch Push Job
- Mock HCM has an optional job that, when enabled, POSTs to `http://localhost:3000/sync/batch/balances`
- Enabled via `/__control/behavior` with `endpoint: "batch_push"`, `behavior: "enable"`
- Interval: configurable (default 60 seconds in integration tests, reduced to 5s in batch conflict tests)

---

## Chaos Config Precedence

1. Endpoint-specific chaos config takes priority
2. If `remaining_count > 0`: apply chaos, decrement counter
3. If `remaining_count = 0`: remove chaos config for that endpoint
4. If `remaining_count = -1`: apply chaos indefinitely (until reset)
5. Normal request proceeds after chaos injection (delay/error injected, not skipped)
