# 01 — Architecture

## System Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                         │
│           (Employee App / Manager App / Admin)              │
└───────────────────┬─────────────────────────────────────────┘
                    │ REST / HTTPS
┌───────────────────▼─────────────────────────────────────────┐
│              TIME-OFF MICROSERVICE  (port 3000)             │
│                                                             │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │  API Layer   │  │  Service Layer  │  │  Domain Layer │  │
│  │  (Controllers│  │  (Business Logic│  │  (Entities,   │  │
│  │   Guards,    │  │   Validation,   │  │   State       │  │
│  │   DTOs)      │  │   Orchestration)│  │   Machine)    │  │
│  └──────┬───────┘  └────────┬────────┘  └───────┬───────┘  │
│         │                   │                   │          │
│  ┌──────▼───────────────────▼───────────────────▼───────┐  │
│  │                   DATA LAYER (TypeORM + SQLite)       │  │
│  │   balance | time_off_request | outbox               │  │
│  │   request_audit_log | balance_change_log            │  │
│  │   reconciliation_log | sync_checkpoint              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              BACKGROUND WORKERS                       │  │
│  │   OutboxWorker (500ms poll)                          │  │
│  │   ReconciliationWorker (15min interval)              │  │
│  │   BalanceTTLChecker (on-demand, per request)         │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────────────────┘
                    │ HTTP (Axios, 8s timeout)
┌───────────────────▼─────────────────────────────────────────┐
│               MOCK HCM SERVICE  (port 4000)                 │
│                                                             │
│  GET  /api/hcm/balance/:employeeId/:locationId/:leaveType  │
│  POST /api/hcm/timeoff/deduct                              │
│  POST /api/hcm/timeoff/reverse                             │
│  POST /api/hcm/batch/balances  (push batch to ReadyOn)     │
│  GET  /api/hcm/batch/balances  (pull batch from HCM)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Module Breakdown (NestJS)

### `TimeOffModule`
- `TimeOffController` — request CRUD endpoints
- `TimeOffService` — orchestrates request lifecycle
- `TimeOffRepository` — DB access for requests
- `RequestStateMachine` — enforces R7

### `BalanceModule`
- `BalanceController` — read balance endpoint
- `BalanceService` — fetches, caches, validates staleness (R5)
- `BalanceRepository` — DB access for balances

### `HcmClientModule`
- `HcmClient` — Axios wrapper with timeout (R8), retry logic, circuit breaker flag
- `HcmBalanceFetcher` — real-time GET
- `HcmDeductionWriter` — real-time POST (called only by outbox worker)

### `OutboxModule`
- `OutboxRepository` — insert/claim/complete outbox records
- `OutboxWorker` — polls every 500ms, claims unprocessed records, calls HCM
- `OutboxProcessor` — dispatches based on `event_type`

### `SyncModule`
- `BatchSyncController` — receives batch push from HCM
- `BatchSyncService` — applies R6, produces `balance_change_log` entries
- `ReconciliationWorker` — compares local vs HCM, logs to `reconciliation_log`
- `SyncCheckpointRepository` — tracks last batch sequence

### `AuditModule`
- `AuditService` — append-only writes to `request_audit_log` and `balance_change_log`
- No public controller (internal use only)

---

## Request Lifecycle (Happy Path)

```
1. Client POSTs /time-off/requests  (with idempotency_key)
2. TimeOffController validates DTO, checks idempotency table
3. TimeOffService:
   a. Acquires row lock on balance(employee, location, leave_type)
   b. Checks local balance TTL (R5) — re-fetches from HCM if stale
   c. Validates sufficient balance locally (optimistic guard)
   d. Creates request record (state: SUBMITTED)
   e. Creates outbox record (event: DEDUCT, ref: request.id)
   f. Commits transaction (request + outbox in same tx)
4. Returns 202 Accepted with request ID
5. OutboxWorker picks up outbox record
6. OutboxProcessor calls HcmDeductionWriter
   a. HCM returns 200 → update request to APPROVED, update local balance, write audit log
   b. HCM returns 4xx → update request to REJECTED, write audit log, release lock
   c. HCM timeout/5xx → increment retry_count, schedule retry (max 3 retries)
   d. After 3 retries → update request to FAILED, alert log
7. Client polls GET /time-off/requests/:id for final status
```

---

## Sync Lifecycle

### Real-Time Sync
- Triggered on every request approval or balance query (if TTL expired)
- `BalanceService.getBalance(employeeId, locationId, leaveType)` always checks `synced_at`
- TTL = 5 minutes (R5)

### Batch Sync (HCM → ReadyOn)
- HCM POSTs to `POST /sync/batch/balances` OR ReadyOn polls `GET /hcm/batch/balances`
- Both paths go through `BatchSyncService.applyBatch(records[])`
- Per-record: compare `hcm_last_updated_at` — apply R6 (skip if not newer)
- Writes `balance_change_log` entry per updated record with `source: BATCH_SYNC`

### Reconciliation (Background)
- Every 15 minutes: `ReconciliationWorker` fetches all local balances
- For each, calls HCM real-time GET
- Compares values — if drift detected: logs to `reconciliation_log`
- Auto-corrects only if drift_age > 15 minutes AND HCM data is newer (R13)

---

## Failure Isolation

| Component Failure | Impact | Mitigation |
|---|---|---|
| HCM real-time API down | New requests blocked at TTL check | Return 503; do not approve on stale data |
| HCM write timeout | Request stays PENDING_HCM | Outbox retries up to 3 times |
| Outbox worker crash | Requests stuck PENDING_HCM | Worker restarts; unclaimed outbox records re-queued |
| Batch sync failure | Local balances may be stale | TTL check + reconciliation catches it |
| SQLite crash mid-tx | Tx rolled back by SQLite | Outbox + request created atomically or not at all |

---

## Constraints

- No message broker (Kafka, RabbitMQ) — outbox pattern replaces it
- No Redis — SQLite row locking for concurrency
- No external cache — in-process TTL enforced by `synced_at` column
- Single process (no horizontal scaling) — SQLite constraint
- All times stored as UTC ISO-8601 strings
