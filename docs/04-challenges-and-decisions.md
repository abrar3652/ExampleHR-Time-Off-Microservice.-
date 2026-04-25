# 04 — Challenges & Decisions

> Each challenge is paired with the EXACT decision made. No alternatives listed unless the tradeoff is critical to understand implementation.

---

## C1 — Distributed Consistency (Local DB vs HCM)

**Challenge:** HCM is source of truth but we must operate locally. Any divergence leads to overdraft or denial of valid requests.

**Decision:**
- Local `balance` table is a **write-through cache** from HCM.
- TTL = 5 minutes enforced on every balance read that precedes a write operation (R5).
- All local balance mutations are journaled in `balance_change_log` (R10).
- Reconciliation worker runs every 15 minutes to detect drift in BOTH `total_days` and `used_days` (R13).
- `hcm_last_updated_at` sourced from HCM — never from local clock — to enable safe conflict resolution.

---

## C2 — Independent HCM Updates (Work Anniversary, Year Reset)

**Challenge:** HCM updates balances without notifying us. Our local data becomes stale without warning.

**Decision:**
- HCM pushes batch data to `POST /sync/batch/balances` on a schedule (configured in HCM, not in our service).
- ReadyOn also PULLS `GET /hcm/batch/balances` every 60 minutes as a fallback.
- Batch apply uses `hcm_last_updated_at` comparison per record (R6) — out-of-order updates are discarded, not applied.
- Real-time GET on balance endpoint refreshes cache whenever TTL is exceeded (R5).
- We do NOT rely on HCM push notifications being delivered reliably — pull is the safety net.

---

## C3 — Concurrent Requests (Serialization Model)

**Challenge:** Two simultaneous requests for the same employee could both pass balance validation and cause overdraft.

**Decision:**
- SQLite `BEGIN IMMEDIATE` acquires a **database-wide write lock**, not a row-level lock. This is the correct and complete model.
- All write transactions — regardless of employee — are serialized by SQLite. This means concurrent requests from different employees also queue behind each other. This is accepted: the system is single-process by design (SQLite constraint).
- `busy_timeout = 5000ms` is configured on the connection. If a transaction cannot acquire the lock within 5 seconds, SQLite returns `SQLITE_BUSY`, which the service maps to HTTP 503.
- `pending_days` column absorbs the "in-flight" demand atomically within each transaction — subsequent transactions see the reservation immediately after the prior commit.
- No optimistic locking. No row-level lock claims. `BEGIN IMMEDIATE` is sufficient and correct.
- Test assertions on concurrency prove correctness (no overdraft), not parallelism. Different-employee requests are NOT expected to run concurrently — they serialize.

---

## C4 — Idempotency Across Retries

**Challenge:** Client retries, network partitions, and HCM timeout-then-success scenarios all produce duplicate requests.

**Decision:**
- Client MUST supply `Idempotency-Key` UUID on all mutating requests.
- Before processing: attempt to INSERT an `idempotency_record` row with `status=IN_PROGRESS` inside the same `BEGIN IMMEDIATE` transaction as the business operation. If the INSERT fails (key already exists), the response depends on the existing row's status:
  - `IN_PROGRESS`: return 409 `IDEMPOTENCY_IN_PROGRESS` — a prior call is still executing. Client polls GET.
  - `COMPLETE`: return the stored `response_status` and `response_body` immediately — replay.
- This approach is crash-safe: if the process crashes after the `IN_PROGRESS` insert but before COMPLETE, the row remains `IN_PROGRESS`. A watchdog cleans up `IN_PROGRESS` rows older than 60 seconds and the client must retry.
- HCM calls use `hcm_external_ref = request.id` — same ref on every retry attempt. HCM's 409 response on duplicate ref is treated as success (R8).
- Idempotency keys expire and are cleaned up after 24 hours.

---

## C5 — HCM Accepts Request But Fails to Respond

**Challenge:** HCM processes the deduction but the HTTP response never arrives (network cut). We don't know if HCM applied it.

**Decision:**
- Outbox worker treats any non-200 outcome (timeout, ECONNREFUSED, 5xx) as retriable.
- On retry, the same `hcm_external_ref` is sent. HCM returns 409 (duplicate ref). Our service treats HCM 409 as success — `APPROVED`, balance updated with HCM's previously-applied values.
- If HCM is broken enough to not enforce idempotency: after 3 retries, request = `FAILED`. Reconciliation will detect the resulting drift and flag it.
- After 3 retries: `failure_reason = DEDUCTION_FAILED`.

---

## C6 — Batch Overwriting Newer Real-Time Data

**Challenge:** Batch job runs hourly. Real-time approval happens at 10:55. Batch (generated at 10:00) arrives at 11:05 and overwrites the deduction.

**Decision:**
- Every balance record stores `hcm_last_updated_at` (from HCM payload, not local clock).
- Batch apply is per-record inside a `BEGIN IMMEDIATE` transaction: if `incoming.hcm_last_updated_at <= stored.hcm_last_updated_at`, skip (R6).
- The entire per-record critical section (read → compare → recompute pending_days → write) is inside a single transaction, preventing TOCTOU on `pending_days` during concurrent batch + request submission.
- `sync_checkpoint.last_batch_at` = batch `generatedAt` (HCM clock). Checkpoint updated only after all pages succeed.

---

## C7 — HCM Downtime

**Challenge:** HCM is down. We cannot validate balances. Do we block all requests?

**Decision:**
- If local balance is fresh (< 5 min): allow SUBMITTED state + outbox creation. Outbox retries HCM write when it recovers.
- If local balance is stale (>= 5 min): return 503 `BALANCE_UNVERIFIABLE`. Do not accept the request.
- If `SQLITE_BUSY` is returned on any write transaction: return 503 — not 500.
- Requests in `PENDING_HCM` during outage retry with backoff: 2s, 4s, 8s before attempts 2, 3, and failure (R15).

---

## C8 — State Mismatch Between Local and HCM

**Challenge:** Our system shows a request as APPROVED but HCM doesn't have the deduction (crash after outbox pop, before HCM confirm).

**Decision:**
- Outbox worker increments `attempts` and marks `PROCESSING` inside a `BEGIN IMMEDIATE` transaction **before** calling HCM. The `time_off_request.state` is `PENDING_HCM` during this window — not APPROVED.
- If worker crashes mid-call: record stays `PROCESSING`. On restart, watchdog resets `PROCESSING` records older than 30s to `PENDING`.
- HCM call is retried with the same `hcm_external_ref` — HCM returns 409, treated as success → APPROVED.
- `state = APPROVED` is only set AFTER HCM returns 200 or 409. Never before.

---

## C9 — Inconsistent HCM Validation

**Challenge:** HCM sometimes fails to return 4xx on invalid balances (stated in requirements). We must be defensive.

**Decision:**
- Always validate locally before creating outbox: `computeAvailableDays(balance) >= daysRequested` using the locked balance row.
- HCM approval is a second gate, not the only gate.
- If HCM returns 200 but `hcm_response.newUsedDays` implies overdraft (i.e., `total_days - newUsedDays - pending_days < 0` after crediting back the pending_days for this request): log `CRITICAL_BALANCE_ANOMALY`, create `HCM_REVERSE` outbox event, set `failure_reason = DEDUCTION_FAILED`, set `state = FAILED`.

---

## C10 — Partial Day / Fractional Leave

**Challenge:** Some leave policies allow half-days.

**Decision:**
- `days_requested` and all balance fields are `REAL` (float) in SQLite.
- Minimum granularity: 0.5 days.
- Validation: `daysRequested % 0.5 === 0` (with float tolerance) enforced in DTO validation.
- All arithmetic uses `Math.round(value * 2) / 2` to snap to 0.5 granularity before comparison.

---

## C11 — Backdated Leave and Retroactive Adjustments

**Challenge:** Employee submits leave for a past date. HCM adjusts a past balance retroactively.

**Decision:**
- Backdated requests (`start_date < today`) are ALLOWED — HCM decides validity.
- If HCM rejects: state → `REJECTED`, reason stored.
- Retroactive HCM adjustments arrive via batch sync. R6 applies — batch skipped if not newer.
- Retroactive adjustments conflicting with APPROVED local requests are flagged in `reconciliation_log` (`drift_field: used_days`) for manual review.

---

## C12 — Cancellation After Approval

**Challenge:** Employee cancels after HCM deduction was confirmed. Balance must be restored.

**Decision:**
- Cancellation of `APPROVED` request transitions to `CANCELLING` state (not `PENDING_HCM`).
- `CANCELLING` is distinct from `PENDING_HCM`. It means: "reversal in flight." The outbox event type is `HCM_REVERSE`. `last_outbox_event = HCM_REVERSE` is set on the request row.
- On HCM reverse 200: `state → CANCELLED`, `used_days` decremented (set to `hcmResponse.newUsedDays`), `balance_change_log` entry written.
- On HCM reverse failure after 3 attempts: `state → FAILED`, `failure_reason = REVERSAL_FAILED`. `used_days` is NOT optimistically restored — HCM still holds the deduction. Reconciliation flags the discrepancy.
- Cancel during `PENDING_HCM`: returns 409 `CANNOT_CANCEL_WHILE_PROCESSING`. Client must wait for APPROVED then cancel.

---

## C13 — No Local Balance Record Exists (First Use)

**Challenge:** A new employee or new location has no local `balance` row. `withBalanceLock` cannot lock a non-existent row.

**Decision:**
- `withBalanceLock` first checks if the balance row exists. If not: fetch from HCM (R5). If HCM returns 200, create the row with a `BEGIN IMMEDIATE` transaction (INSERT OR IGNORE to handle race). If HCM returns 404, propagate 404 immediately — no request is created.
- After creation, the same `BEGIN IMMEDIATE` transaction locks the newly-created row and the callback proceeds.
- The INSERT uses `INSERT OR IGNORE` so a concurrent creation race is safe — whichever wins, the row exists for both.