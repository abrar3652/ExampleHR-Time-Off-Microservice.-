# 08 — Test Strategy

> Tests are the primary deliverable alongside the TRD. Coverage < 80% on service layer is a build failure.
> All tests use Jest. Integration tests use Supertest against a running NestJS app with SQLite in-memory.
> Mock HCM runs as a real HTTP server on port 4000 during integration tests.

---

## Test Types & Their Purpose

| Type | Scope | Framework | HCM |
|---|---|---|---|
| Unit | Service/domain logic | Jest | Mocked (jest.mock) |
| Integration | Full HTTP → DB | Jest + Supertest | Real Mock HCM (port 4000) |
| Concurrency | Race conditions | Jest + parallel promises | Real Mock HCM |
| Idempotency | Replay safety | Jest + Supertest | Real Mock HCM |
| Failure Simulation | HCM failure modes | Jest + Supertest | Mock HCM chaos endpoints |
| Batch Conflict | Batch vs real-time | Jest + Supertest | Real Mock HCM |
| Contract | HCM API shape | Jest | Real Mock HCM |

---

## Test File Structure

```
/test
├── unit/
│   ├── state-machine.spec.ts
│   ├── balance.service.spec.ts
│   ├── time-off.service.spec.ts
│   ├── outbox.processor.spec.ts
│   ├── batch-sync.service.spec.ts
│   └── idempotency.interceptor.spec.ts
├── integration/
│   ├── balance.e2e.spec.ts
│   ├── time-off-request.e2e.spec.ts
│   ├── cancellation.e2e.spec.ts
│   ├── sync-batch.e2e.spec.ts
│   └── reconciliation.e2e.spec.ts
├── concurrency/
│   └── concurrent-requests.spec.ts
├── idempotency/
│   └── idempotency.spec.ts
├── failure/
│   ├── hcm-timeout.spec.ts
│   ├── hcm-5xx.spec.ts
│   ├── hcm-network-cut.spec.ts
│   └── outbox-retry.spec.ts
├── batch/
│   └── batch-vs-realtime.spec.ts
└── helpers/
    ├── app-factory.ts
    ├── hcm-mock-control.ts    ← API client for controlling Mock HCM behavior
    └── db-seed.ts
```

---

## Unit Tests

### `state-machine.spec.ts`
```
✓ DRAFT → SUBMITTED is valid
✓ SUBMITTED → PENDING_HCM is valid
✓ PENDING_HCM → APPROVED is valid
✓ PENDING_HCM → REJECTED is valid
✓ PENDING_HCM → FAILED is valid
✓ APPROVED → CANCELLED is valid
✓ FAILED → SUBMITTED is valid (retry)
✓ APPROVED → SUBMITTED throws InvalidStateTransitionException
✓ REJECTED → APPROVED throws InvalidStateTransitionException
✓ CANCELLED → SUBMITTED throws InvalidStateTransitionException
✓ Every invalid transition for every state is tested (exhaustive matrix)
```

### `balance.service.spec.ts`
```
✓ Returns fresh local balance if synced_at < 5 min ago
✓ Fetches from HCM if synced_at >= 5 min ago
✓ Returns stale local balance and logs warning if HCM fails within TTL
✓ Throws HcmUnavailableException if HCM fails AND balance is stale
✓ Updates local balance record after successful HCM fetch
✓ Writes balance_change_log entry after HCM fetch
✓ Does NOT update local record if HCM returns older hcm_last_updated_at
```

### `time-off.service.spec.ts`
```
✓ Creates request and outbox record in single transaction
✓ Increments pending_days on request creation
✓ Throws InsufficientBalanceException if available_days < daysRequested
✓ Does not create outbox if balance check fails
✓ Validates daysRequested is multiple of 0.5
✓ Validates startDate < endDate
✓ Validates daysRequested matches computed business days
✓ Does NOT mutate balance without HCM confirmation
```

### `outbox.processor.spec.ts`
```
✓ Moves request to APPROVED on HCM 200
✓ Decrements pending_days and increments used_days on APPROVED
✓ Writes balance_change_log on APPROVED
✓ Writes audit log on every state transition
✓ Moves request to REJECTED on HCM 4xx (non-409)
✓ Restores pending_days on REJECTED
✓ Treats HCM 409 as success (APPROVED)
✓ Schedules retry after TIMEOUT (backoff: 4s, 16s)
✓ Moves to FAILED after 3rd attempt
✓ Restores pending_days on FAILED
✓ Logs CRITICAL on FAILED
```

### `batch-sync.service.spec.ts`
```
✓ Applies batch record if hcm_last_updated_at is newer
✓ Skips batch record if hcm_last_updated_at is equal or older (R6)
✓ Creates new balance record if none exists
✓ Does NOT overwrite pending_days with batch value
✓ Recomputes pending_days from in-flight requests during batch apply
✓ Writes balance_change_log with source=BATCH_SYNC for each updated record
✓ Returns correct skipped count
✓ Updates sync_checkpoint after successful batch
```

---

## Integration Tests

### `time-off-request.e2e.spec.ts`

**Setup:** Real NestJS app + SQLite in-memory + Mock HCM on port 4000

```
✓ POST /time-off/requests → 202, state=SUBMITTED
✓ GET /time-off/requests/:id → returns correct state
✓ After outbox processes → GET returns state=APPROVED
✓ Approval updates balance.used_days and clears pending_days
✓ POST with missing Idempotency-Key → 400
✓ POST with invalid leaveType → 422
✓ POST with daysRequested > availableDays → 422
✓ POST when HCM stale and unreachable → 503
```

### `balance.e2e.spec.ts`
```
✓ GET /balances/:emp/:loc/:type → fetches from HCM if not cached
✓ GET /balances → returns cached if fresh (< 5 min)
✓ GET /balances → re-fetches from HCM if stale (> 5 min)
✓ GET /balances with HCM down and stale cache → 503
✓ GET /balances with HCM down and fresh cache → 200 (cached)
```

### `cancellation.e2e.spec.ts`
```
✓ Cancel SUBMITTED request → state=CANCELLED, pending_days restored
✓ Cancel APPROVED request → triggers HCM_REVERSE outbox event
✓ After HCM_REVERSE succeeds → state=CANCELLED, used_days restored
✓ Cancel REJECTED request → 409 invalid transition
✓ Cancel CANCELLED request → 409 invalid transition
```

### `sync-batch.e2e.spec.ts`
```
✓ POST /sync/batch/balances with new records → applied
✓ POST /sync/batch/balances with older records → skipped
✓ POST /sync/batch/balances with mixed records → applies newer, skips older
✓ Batch does not overwrite in-flight pending_days
✓ sync_checkpoint updated after batch
```

---

## Concurrency Tests

### `concurrent-requests.spec.ts`

```typescript
it('prevents overdraft under 10 concurrent requests for same balance', async () => {
  // Setup: employee has 5 days available
  await hcmMock.setBalance('emp-001', 'loc-nyc', 'ANNUAL', { totalDays: 5, usedDays: 0 });
  await seedLocalBalance('emp-001', 'loc-nyc', 'ANNUAL', { totalDays: 5 });

  // Fire 10 concurrent requests for 1 day each
  const requests = Array.from({ length: 10 }, (_, i) =>
    supertest(app.getHttpServer())
      .post('/time-off/requests')
      .set('Idempotency-Key', uuidv4())  // unique key per request
      .set('X-Employee-Id', 'emp-001')
      .send({ locationId: 'loc-nyc', leaveType: 'ANNUAL', startDate: '2025-03-01', endDate: '2025-03-01', daysRequested: 1 })
  );

  const results = await Promise.all(requests);
  const accepted = results.filter(r => r.status === 202);
  const rejected = results.filter(r => r.status === 422);

  // Exactly 5 should be accepted, 5 rejected
  expect(accepted.length).toBe(5);
  expect(rejected.length).toBe(5);

  // Wait for outbox to process
  await waitForOutboxDrain(app, 10000);

  // Final balance: pending=0, used=5, available=0
  const balance = await getLocalBalance('emp-001', 'loc-nyc', 'ANNUAL');
  expect(balance.usedDays).toBe(5);
  expect(balance.pendingDays).toBe(0);
  expect(balance.availableDays).toBe(0);
  // Never negative
  expect(balance.availableDays).toBeGreaterThanOrEqual(0);
});
```

```
✓ No overdraft under 10 concurrent requests (proven above)
✓ Concurrent requests for DIFFERENT employees do not block each other
✓ Concurrent batch sync + request submission: no data corruption
✓ Concurrent cancel + approve: only one succeeds
```

---

## Idempotency Tests

### `idempotency.spec.ts`

```
✓ Same Idempotency-Key, same body → returns stored response, no duplicate DB record
✓ Same Idempotency-Key, same body, 10 concurrent calls → exactly one record created
✓ Same Idempotency-Key, different body → 409 IDEMPOTENCY_CONFLICT
✓ Expired idempotency key (simulate 24h+ old) → treated as new request
✓ Missing Idempotency-Key header → 400
✓ Invalid UUID Idempotency-Key → 400
✓ Replay of REJECTED request → returns same REJECTED response, no new outbox record
✓ Replay of APPROVED request → returns same APPROVED response, no second HCM call
✓ HCM_DEDUCT outbox with same hcm_external_ref → HCM receives deduct exactly once
```

---

## Failure Simulation Tests

### `hcm-timeout.spec.ts`
```
✓ HCM times out → request stays PENDING_HCM, outbox retries
✓ After 3 timeouts → request moves to FAILED, pending_days restored
✓ HCM recovers before 3rd attempt → request moves to APPROVED
```

### `hcm-5xx.spec.ts`
```
✓ HCM 500 → outbox retries with backoff
✓ HCM 503 → treated same as 500 (retry)
✓ HCM 4xx (422) → request REJECTED immediately, no retry
✓ HCM 409 (duplicate ref) → treated as success, request APPROVED
```

### `hcm-network-cut.spec.ts`
```
✓ Network cut mid-request → treated as timeout → retry
✓ Balance read fails (HCM down, balance stale) → 503 to client
✓ Balance read fails (HCM down, balance fresh) → 200 with cached data
```

### `outbox-retry.spec.ts`
```
✓ Outbox worker crash (simulated) → PROCESSING records re-queued after 30s
✓ Outbox processes records in FIFO order
✓ Outbox does not double-process DONE records
```

---

## Batch vs Real-Time Conflict Tests

### `batch-vs-realtime.spec.ts`

```
✓ Batch with older timestamp does not overwrite real-time approved deduction
✓ Batch with newer timestamp correctly updates total_days
✓ Batch arrives during active request processing → pending_days preserved
✓ Out-of-order batch (delayed batch from 2 days ago) → skipped per R6
✓ Batch and real-time fetch happen concurrently → no data corruption
✓ Batch with invalid record (missing field) → skips that record, continues rest
```

---

## Coverage Requirements

```
Service Layer:         ≥ 80% line coverage
Domain (state machine): 100% branch coverage
Outbox Processor:      ≥ 90% branch coverage
API Controllers:       100% endpoint coverage (at least one integration test per endpoint)
```

**Jest configuration:**
```json
{
  "coverageThreshold": {
    "global": { "lines": 80 },
    "./src/modules/time-off/time-off.service.ts": { "lines": 90, "branches": 85 },
    "./src/modules/outbox/outbox.processor.ts": { "lines": 90, "branches": 90 },
    "./src/domain/state-machine.ts": { "branches": 100 }
  }
}
```

---

## Mock HCM Control API (Used in Tests)

The Mock HCM exposes a `/__control` namespace for test configuration:

```typescript
// helpers/hcm-mock-control.ts

export class HcmMockControl {
  // Set a balance value in Mock HCM
  setBalance(employeeId, locationId, leaveType, balance): Promise<void>

  // Make next N calls to a specific endpoint return chaos
  setNextCallBehavior(endpoint: string, behavior: 'timeout' | '500' | '409' | 'slow', count: number): Promise<void>

  // Reset all chaos/overrides
  reset(): Promise<void>

  // Get call log (how many times each endpoint was called)
  getCallLog(): Promise<CallLog>

  // Advance internal clock (for testing hcm_last_updated_at ordering)
  advanceClock(ms: number): Promise<void>
}
```
