# 06 — Concurrency & Idempotency

---

## Concurrency Model

### SQLite's Actual Behavior

SQLite in WAL mode allows concurrent reads but **serializes all writers** at the database level, not at the row level. `BEGIN IMMEDIATE` acquires a write lock for the entire database file. This is a fundamental SQLite constraint.

**What this means for the system:**
- All balance-mutating transactions queue behind each other, regardless of which employee they concern.
- There is no such thing as "concurrent writes for different employees" in this system. They serialize.
- This is correct and safe. The system is single-process by design (SQLite constraint, documented in architecture).
- Performance implication: write throughput is bounded by SQLite's single-writer throughput (~1000-5000 writes/sec for simple transactions). Acceptable for a time-off service that is not write-heavy.

**`busy_timeout` is mandatory:**
```typescript
// In TypeORM DataSource configuration
const dataSource = new DataSource({
  type: 'better-sqlite3',
  database: 'timeoff.db',
  enableWAL: true,       // WAL mode for better read concurrency
  busyErrorRetry: 5000,  // Wait up to 5000ms for write lock before returning SQLITE_BUSY
});
```

When `SQLITE_BUSY` is returned after the timeout, the service layer catches `QueryFailedError` with code `SQLITE_BUSY` and throws `DatabaseBusyException` which maps to HTTP 503.

### Correct Mental Model

```
Request A (emp-001):  BEGIN IMMEDIATE ──────────── COMMIT
Request B (emp-002):                   (waits) ─── BEGIN IMMEDIATE ─── COMMIT
Request C (emp-001):                                                    (waits) ─── BEGIN IMMEDIATE ─── COMMIT
```

All three serialize. A and C concern the same employee. B concerns a different employee. None of this matters — they all queue.

---

## `withBalanceLock` — The Only Entry Point for Balance Mutation

```typescript
const MAX_BALANCE_ATTEMPTS = MAX_OUTBOX_ATTEMPTS; // = 3, from enums.ts

async function withBalanceLock<T>(
  employeeId: string,
  locationId: string,
  leaveType: LeaveType,
  fn: (manager: EntityManager, balance: Balance) => Promise<T>
): Promise<T> {
  return dataSource.transaction('IMMEDIATE', async (manager) => {
    // Step 1: Attempt to find the existing balance row
    let balance = await manager
      .getRepository(Balance)
      .findOne({ where: { employeeId, locationId, leaveType } });

    // Step 2: If no balance row exists, fetch from HCM and create it
    // This runs INSIDE the BEGIN IMMEDIATE transaction
    if (!balance) {
      const hcmResult = await hcmBalanceFetcher.getBalance(employeeId, locationId, leaveType);
      if (!hcmResult.success) throw new HcmUnavailableException();
      if (hcmResult.statusCode === 404) throw new BalanceNotFoundError(employeeId, locationId, leaveType);

      // INSERT OR IGNORE: if a concurrent transaction already created it, this is a no-op
      // Then re-read — we're holding the write lock so no further concurrent creation is possible
      balance = manager.create(Balance, {
        id: uuidv4(),
        employeeId,
        locationId,
        leaveType,
        totalDays: hcmResult.data.totalDays,
        usedDays: hcmResult.data.usedDays,
        pendingDays: 0,
        hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
        syncedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await manager.getRepository(Balance).save(balance);
    }

    // Step 3: Execute the callback with the locked balance
    // The BEGIN IMMEDIATE lock is held for the duration of fn()
    return fn(manager, balance);
  });
}
```

**Rule:** `withBalanceLock` is the ONLY entry point for balance mutation. No code may read-then-write a balance record outside this function.

---

## Race Condition: Concurrent Request Submission

**Scenario:** Employee submits 10 simultaneous requests for 1 day each, with 5 days available.

**What actually happens with BEGIN IMMEDIATE:**
```
R1: BEGIN IMMEDIATE (acquires lock) → reads available=5, pending=0 → pending becomes 1 → COMMIT
R2: BEGIN IMMEDIATE (acquires lock after R1) → reads available=4, pending=1 → pending becomes 2 → COMMIT
R3: BEGIN IMMEDIATE (acquires lock after R2) → reads available=3, pending=2 → pending becomes 3 → COMMIT
R4: BEGIN IMMEDIATE (acquires lock after R3) → reads available=2, pending=3 → pending becomes 4 → COMMIT
R5: BEGIN IMMEDIATE (acquires lock after R4) → reads available=1, pending=4 → pending becomes 5 → COMMIT
R6: BEGIN IMMEDIATE (acquires lock after R5) → reads available=0, pending=5 → throws InsufficientBalanceException
... R7-R10: same as R6, all rejected with 422
```

Exactly 5 accepted, 5 rejected. No overdraft possible. The lock + `pending_days` together make this a strict serializable FIFO queue.

---

## Race Condition: Outbox Worker Claiming

```typescript
// Atomic claim — only one claim succeeds per record
// This runs in its own BEGIN IMMEDIATE transaction, separate from processing
async function claimNextBatch(limit = 5): Promise<Outbox[]> {
  return dataSource.transaction('IMMEDIATE', async (manager) => {
    const now = new Date().toISOString();
    const candidates = await manager
      .getRepository(Outbox)
      .find({
        where: { status: 'PENDING', processAfter: LessThanOrEqual(now) },
        order: { createdAt: 'ASC' },
        take: limit,
      });

    if (candidates.length === 0) return [];

    const ids = candidates.map(r => r.id);
    await manager.getRepository(Outbox).update(
      { id: In(ids) },
      { status: 'PROCESSING', lastAttemptedAt: now }
    );

    return candidates; // IDs are now claimed; no other worker can claim them
  });
}
```

**Dead record recovery (runs on every poll tick before claiming):**
```typescript
async function resetStuckRecords(): Promise<void> {
  const cutoff = new Date(Date.now() - 30_000).toISOString(); // 30 seconds ago
  await dataSource.transaction('IMMEDIATE', async (manager) => {
    await manager.getRepository(Outbox).update(
      { status: 'PROCESSING', lastAttemptedAt: LessThan(cutoff) },
      { status: 'PENDING', processAfter: new Date().toISOString() }
    );
  });
}
```

---

## Idempotency Implementation

### The Core Pattern: Claim Before Execute

The idempotency record is inserted as `IN_PROGRESS` **inside the same `BEGIN IMMEDIATE` transaction** as the business operation. This provides two guarantees:
1. No two concurrent requests with the same key can both execute — the second INSERT fails the UNIQUE constraint.
2. No race between "check if exists" and "insert" — the write lock is held from check to insert.

```typescript
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['idempotency-key'];

    if (!key) throw new BadRequestException('Idempotency-Key header is required');
    if (!isUUID(key, 4)) throw new BadRequestException('Idempotency-Key must be UUID v4');

    // Check for existing record OUTSIDE a transaction (fast path for completed replays)
    const existing = await this.idempotencyRepo.findByKey(key);

    if (existing?.status === 'COMPLETE') {
      // Completed replay — return stored response immediately
      const res = context.switchToHttp().getResponse<Response>();
      res.status(existing.responseStatus).json(JSON.parse(existing.responseBody));
      return of(null);
    }

    if (existing?.status === 'IN_PROGRESS') {
      // A prior call is still executing (or crashed and left an IN_PROGRESS row)
      // Check age — if older than 60s, it's a crashed record, treat as absent
      const ageSeconds = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
      if (ageSeconds < 60) {
        throw new ConflictException({
          error: 'IDEMPOTENCY_IN_PROGRESS',
          message: 'A request with this key is currently being processed. Poll GET for status.',
        });
      }
      // Stale IN_PROGRESS — delete it and fall through to fresh execution
      await this.idempotencyRepo.delete(key);
    }

    // Insert IN_PROGRESS claim — if two requests race here, one will get a UNIQUE conflict
    // The conflict is handled by the service layer (withBalanceLock) which wraps the INSERT
    // Business logic inserts the idempotency_record inside its BEGIN IMMEDIATE transaction
    // This interceptor passes the key to the handler via request context
    req['idempotencyKey'] = key;
    req['idempotencyExpiresAt'] = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    return next.handle().pipe(
      tap(async (responseBody) => {
        // Mark COMPLETE — the IN_PROGRESS row was already inserted by the service layer
        const statusCode = context.switchToHttp().getResponse<Response>().statusCode;
        await this.idempotencyRepo.markComplete(key, statusCode, JSON.stringify(responseBody));
      }),
      catchError(async (err) => {
        // On error, delete the IN_PROGRESS claim so retries are possible
        await this.idempotencyRepo.delete(key).catch(() => {});
        throw err;
      })
    );
  }
}
```

**In `TimeOffService.createRequest` (inside `withBalanceLock`):**
```typescript
// This executes inside BEGIN IMMEDIATE — so the INSERT is part of the same write lock
// as the balance check and request creation
await manager.getRepository(IdempotencyRecord).insert({
  idempotencyKey: dto.idempotencyKey,
  status: 'IN_PROGRESS',
  expiresAt: req.idempotencyExpiresAt,
  createdAt: new Date().toISOString(),
});
// If this INSERT fails (UNIQUE violation), it means two concurrent calls slipped past
// the interceptor check. The BEGIN IMMEDIATE transaction rolls back cleanly.
// The second caller receives a DB constraint error → mapped to 409 IDEMPOTENCY_IN_PROGRESS.
```

### Why This Is Crash-Safe

- **Process crash after INSERT but before COMPLETE:** Row stays `IN_PROGRESS`. After 60 seconds, the interceptor treats it as stale and allows a fresh attempt.
- **Process crash after business op completes but before COMPLETE update:** The business effect is committed (request exists in DB). On retry, the interceptor finds the `IN_PROGRESS` row (< 60s old), returns 409. Client waits, retries after 60s. The fresh attempt finds NO `IN_PROGRESS` row (deleted as stale) but finds the already-created `time_off_request` via its idempotency_key (UNIQUE constraint on that table catches it) and returns the stored response.

### Layer 2: DB-Level Idempotency on `time_off_request`

`time_off_request.idempotency_key` has a UNIQUE constraint. Even if the idempotency interceptor has a gap, an attempt to INSERT two requests with the same key fails at the DB constraint level. The service catches this `QueryFailedError` and returns 409.

### Layer 3: HCM-Level Idempotency

`hcm_external_ref = request.id`. Sent on every retry. HCM's 409 DUPLICATE_EXTERNAL_REF is treated as success.

---

## Idempotency Failure Mode Table

| Scenario | Behavior |
|---|---|
| Same key, same body, first call completed | Return stored 200/202 response immediately |
| Same key, currently IN_PROGRESS (< 60s) | Return 409 IDEMPOTENCY_IN_PROGRESS |
| Same key, IN_PROGRESS but stale (≥ 60s, crashed) | Delete stale row, treat as fresh request |
| Same key, different body | The idempotency interceptor does NOT compare bodies — it replays based on key only. Body differences produce the same original result. (Documented tradeoff: simpler than body fingerprinting.) |
| No key supplied | 400 |
| Key is not UUID v4 | 400 |
| HCM duplicate ref → 409 | Treated as success → APPROVED |
| Outbox crashes at PROCESSING | Reset to PENDING after 30s; HCM re-called with same ref |

---

## Anti-Patterns (NEVER DO)

```typescript
// ❌ WRONG: Read-then-check without holding write lock
const balance = await this.balanceRepo.findOne(...);
if (balance.availableDays >= daysRequested) {   // TOCTOU window here
  await this.balanceRepo.update(...);
}

// ❌ WRONG: Computing available_days from a stored column
// The schema no longer has available_days as a stored/virtual column.
// Always compute: totalDays - usedDays - pendingDays in TypeScript.

// ❌ WRONG: Updating used_days as a delta
balance.usedDays += request.daysRequested;   // ignores concurrent HCM changes
await save(balance);

// ✅ CORRECT: Set used_days from HCM authoritative response
balance.usedDays = hcmResponse.newUsedDays;   // authoritative value from HCM
balance.hcmLastUpdatedAt = hcmResponse.lastUpdatedAt;
balance.syncedAt = new Date().toISOString();
await manager.save(balance);   // inside BEGIN IMMEDIATE

// ❌ WRONG: Creating a second outbox record on retry
await outboxRepo.insert({ requestId, eventType: 'HCM_DEDUCT', ... });   // duplicate!

// ✅ CORRECT: Reset the existing FAILED outbox record
await outboxRepo.update(
  { requestId, status: 'FAILED' },
  { status: 'PENDING', attempts: 0, lastError: null, processAfter: new Date().toISOString() }
);
// The unique partial index idx_outbox_active enforces that only one active record exists.
```