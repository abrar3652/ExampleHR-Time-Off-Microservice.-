# 00 — System Rules & Invariants

> These rules are NEVER violated by any code in this repository.
> Every Cursor prompt must reference this file. Any generated code that breaks a rule must be rejected.

---

## R1 — HCM Is The Only Source of Truth

- The local database is a **cache and operational ledger**, not the authority on balances.
- Balance values stored locally MUST originate from HCM — either real-time fetch or batch sync.
- The service MUST NEVER invent, compute, or assume a balance without HCM confirmation.
- On any doubt about local balance accuracy, re-fetch from HCM before proceeding.

---

## R2 — No Balance Mutation Without HCM Validation

- A time-off request MUST NOT move to `APPROVED` state unless HCM has confirmed the deduction.
- A balance deduction recorded locally MUST be backed by a successful HCM write confirmation.
- If HCM write fails or is ambiguous, the request state MUST remain `PENDING_HCM` — never silently committed.
- On HCM approval, `used_days` is set to the **authoritative value from HCM's response** (`newUsedDays`), not computed as a local delta. `hcm_last_updated_at` and `synced_at` are also updated from the HCM response in the same transaction.

---

## R3 — Idempotency Is Enforced Everywhere

- Every write operation (request creation, approval, cancellation, sync) MUST be idempotent.
- Idempotency is enforced via `idempotency_key` (client-supplied UUID) on all mutating endpoints.
- Reprocessing the same `idempotency_key` MUST return the same result without side effects.
- HCM calls MUST include a stable `externalRef` derived from the internal request ID to prevent duplicate HCM deductions.
- The `idempotency_record` row MUST be inserted **before** the business operation executes (as a claim), not after. If the business operation fails, the claim is deleted. This prevents duplicate execution under concurrent retries.

---

## R4 — All Writes Are Serialized at the Database Level

- SQLite `BEGIN IMMEDIATE` acquires a **database-wide write lock** — not a row-level lock.
- This is the correct, complete statement: ALL write operations are serialized globally by SQLite.
- The practical consequence: concurrent requests from different employees also serialize. This is acceptable given the single-process SQLite constraint and is correct for correctness.
- The `pending_days` column ensures that once a transaction commits, any subsequent transaction — regardless of employee — sees the updated reservation immediately.
- No optimistic locking. No "check then act" without holding the write lock.
- `busy_timeout` MUST be configured to **5000ms** on the SQLite connection. If `SQLITE_BUSY` is returned after timeout, the operation returns HTTP 503 (not 500).

---

## R5 — Stale Data Must Never Drive Approval

- Local balance cache has a TTL of **5 minutes**.
- If the local balance record's `synced_at` is older than 5 minutes at approval time, the service MUST re-fetch from HCM real-time API before proceeding.
- If HCM real-time fetch fails, approval MUST be rejected with `503` — not approved on stale data.
- If NO local balance record exists (first use), the service MUST fetch from HCM and create the record. If HCM returns 404, propagate 404 to the client immediately. The `withBalanceLock` function MUST handle a null balance by creating a placeholder lock row before executing the callback.

---

## R6 — Batch Sync Must Not Overwrite Newer Data

- Every balance record has a `hcm_last_updated_at` timestamp (sourced from HCM payload).
- Batch sync MUST only update a local record if the incoming `hcm_last_updated_at` is **strictly newer** than the stored one.
- If batch data is older or equal, the record is silently skipped (not overwritten).
- This rule applies per-record, not per-batch.
- The entire per-record apply (read balance → compare timestamp → recompute pending_days → write balance) MUST execute inside a single `BEGIN IMMEDIATE` transaction to prevent TOCTOU on `pending_days`.
- `sync_checkpoint.last_batch_at` is set to the batch's `generatedAt` (HCM time), NOT local `now()`. The checkpoint is only updated after ALL pages of a batch have been successfully applied.

---

## R7 — Request State Machine Is Strict

Valid transitions only:

```
SUBMITTED   → PENDING_HCM
PENDING_HCM → APPROVED | REJECTED | FAILED
APPROVED    → CANCELLING
CANCELLING  → CANCELLED | FAILED
SUBMITTED   → CANCELLED
FAILED      → SUBMITTED   (retry: resets outbox, does NOT create a second outbox record)
```

**Removed:** `DRAFT` state is eliminated — no endpoint creates a DRAFT, it was dead code.

**Added:** `CANCELLING` state represents a cancellation-initiated-but-HCM-not-yet-confirmed state. It is semantically distinct from `PENDING_HCM` (deduction in flight). This prevents state ambiguity between deduction and reversal in-flight operations.

**Cancel during PENDING_HCM:** NOT ALLOWED. A request in `PENDING_HCM` cannot be cancelled. The client receives `409 CANNOT_CANCEL_WHILE_PROCESSING`. Once the request resolves to `APPROVED`, the client may then cancel (transitioning to `CANCELLING`).

- Any code attempting an invalid transition MUST throw `InvalidStateTransitionException` — not silently succeed.
- State transitions MUST be recorded in the `request_audit_log` table with actor, timestamp, and reason.

---

## R8 — HCM Failures Are Handled Explicitly

- Every HCM call MUST have a timeout of **8 seconds**, enforced via `Promise.race` (not Axios timeout config).
- A failed HCM call MUST NOT leave the system in an implicit/unknown state.
- On timeout or 5xx from HCM: schedule retry via outbox (do NOT mark FAILED immediately). See R15 for retry strategy.
- On 4xx from HCM (non-409): mark request as `REJECTED`, store HCM error payload, do NOT retry.
- On 409 from HCM: treat as success — deduction was already applied. Proceed as if 200.
- On ambiguous outcome (network cut mid-request): treat as timeout — retry via outbox.

---

## R9 — All External Calls Go Through an Outbox

- Any state change that requires an HCM write MUST be written to the `outbox` table in the same local DB transaction as the state change.
- A separate outbox worker picks up and executes HCM calls.
- This ensures the local state change and the intent to call HCM are atomic.
- The outbox worker is the only component that calls HCM write endpoints.
- On `FAILED → SUBMITTED` retry: the existing FAILED outbox record is reset (`status = PENDING, attempts = 0`) rather than creating a new record. This prevents orphaned outbox records. A partial unique index enforces at most one active outbox record per request: `CREATE UNIQUE INDEX idx_outbox_active ON outbox(request_id) WHERE status != 'DONE'`.

---

## R10 — Audit Log Is Immutable and Append-Only

- `request_audit_log` rows are NEVER updated or deleted.
- `balance_change_log` rows are NEVER updated or deleted.
- Every balance mutation (from any source: request, batch sync, manual correction) MUST produce one `balance_change_log` row **per field changed**. A batch update that changes both `total_days` and `used_days` produces two rows.

---

## R11 — No Silent Failures

- Every catch block MUST either: re-throw, log + return a typed error response, or log + transition state explicitly.
- Empty catch blocks are forbidden.
- Every background job (outbox worker, reconciliation, batch processor) MUST log start, success, and failure with structured fields.

---

## R12 — Dimensions Are Immutable Per Request

- Once a time-off request is created, its `(employee_id, location_id, leave_type, start_date, end_date)` CANNOT be changed.
- To change dimensions, cancel the existing request and create a new one.

---

## R13 — Reconciliation Scope and Auto-Correction

- The reconciliation job detects drift between local and HCM balances.
- It MUST compare BOTH `total_days` AND `used_days` against HCM values.
- For `used_days` comparison, adjust for local in-flight requests: `effective_local_used = used_days + pending_days`. HCM does not know about pending requests; comparing raw `used_days` will always show false drift during normal operation.
- It MUST log every detected discrepancy to `reconciliation_log` with a `drift_field` column indicating which field drifted.
- It MUST NOT auto-update the local balance unless the drift is older than 15 minutes AND the HCM balance's `lastUpdatedAt` is strictly newer than local `hcm_last_updated_at`.
- All auto-corrections MUST be logged with `source: AUTO_RECONCILE`.

---

## R14 — Test Coverage Gates

- Unit test coverage MUST be ≥ 80% on service layer.
- Every public API endpoint MUST have at least one integration test.
- Concurrency tests MUST prove no overdraft under 10 simultaneous requests for the same balance.
- Idempotency tests MUST prove replay safety for all mutating endpoints.
- Concurrency tests must NOT assert that different-employee requests run in parallel — SQLite serializes all writes. Assert only correctness (no overdraft), not timing.

---

## R15 — Retry Backoff (Single Canonical Definition)

- Max attempts: **3**. The attempt counter starts at **1** on first execution.
- Backoff: `delay_seconds = 2^attempt` — producing delays of **2s, 4s, 8s** before attempts 2, 3, and failure declaration respectively.
- After attempt 3 fails: mark outbox `FAILED`, mark request `FAILED`, restore `pending_days`, write audit log.
- This definition supersedes any other backoff values stated elsewhere in the docs.

---

## Technology Stack (Fixed)

| Concern | Choice |
|---|---|
| Framework | NestJS |
| Database | SQLite (via TypeORM, `better-sqlite3` driver) |
| Language | TypeScript (strict mode) |
| HTTP Client | Axios with `Promise.race` timeout wrapper |
| Locking | `BEGIN IMMEDIATE` (database-wide write lock) + `busy_timeout=5000ms` |
| Job Queue | Outbox pattern (polled every 500ms, no external broker) |
| Mock HCM | Separate NestJS app on port 4000 |
| Test Framework | Jest + Supertest |