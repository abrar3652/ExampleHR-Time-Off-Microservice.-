# 07 — Failure Handling

---

## Failure Classification

| Class | Examples | Required Action |
|---|---|---|
| **Client Error (4xx)** | Invalid input, insufficient balance, bad state transition | Return error immediately, no retry |
| **HCM Validation Error (4xx non-409)** | Invalid dimension combo, insufficient balance per HCM | Mark REJECTED, store HCM error, no retry |
| **HCM Duplicate Ref (409)** | Same externalRef already processed | Treat as success — proceed to APPROVED |
| **HCM Server Error (5xx)** | HCM internal error | Retry via outbox (max 3 attempts), mark FAILED after exhaustion |
| **HCM Timeout** | 8s Promise.race exceeded | Same as 5xx — retry via outbox |
| **HCM Network Error** | ECONNREFUSED, ECONNRESET | Same as 5xx — retry via outbox |
| **SQLite BUSY** | write lock not acquired within 5000ms | Return 503 (not 500), no retry at service layer |
| **Local DB Error** | Constraint violation, corrupt state | Rollback transaction, return 500, log CRITICAL |
| **Worker Crash** | Node process killed | Auto-recovery: re-claim PROCESSING records on restart |
| **Batch Partial Failure** | Error on one record | Skip that record, log error, continue batch |

---

## Outbox Retry Strategy (Canonical — from R15)

```
MAX_ATTEMPTS = 3

Attempt 1: executes immediately after creation (process_after = created_at)
Attempt 2: executes 2 seconds after attempt 1 failure  (delay = 2^1 = 2s)
Attempt 3: executes 4 seconds after attempt 2 failure  (delay = 2^2 = 4s)

After attempt 3 failure:
  - outbox.status = FAILED
  - time_off_request.state = FAILED
  - time_off_request.failure_reason = DEDUCTION_FAILED | REVERSAL_FAILED
  - balance.pending_days decremented
  - request_audit_log entry (actor: SYSTEM, reason: OUTBOX_EXHAUSTED)
  - Log CRITICAL with requestId, employeeId, all attempt details
```

**Backoff formula:** `delay_seconds = 2^attempt_number` where `attempt_number` starts at 1 after first failure.

**Attempt counter semantics:**
- `outbox.attempts` starts at `0`.
- Incremented to `1` before the first HCM call executes.
- If `attempts` reaches `MAX_ATTEMPTS + 1 = 4` before a call: mark FAILED without calling HCM (safety guard, should not occur in normal operation).
- The check `if (outbox.attempts >= MAX_ATTEMPTS)` after incrementing correctly identifies exhaustion after the 3rd real call.

---

## Outbox Worker Poll Cycle

```typescript
// Runs every 500ms via @Interval(500)
async function pollOutbox(): Promise<void> {
  await resetStuckRecords();         // Reset PROCESSING records older than 30s
  const records = await claimNextBatch(5);  // Claim up to 5 PENDING records atomically
  for (const record of records) {
    await processRecord(record).catch(err => {
      // Per-record error isolation: one failed record does NOT stop others
      logger.error({ outboxId: record.id, requestId: record.requestId, err }, 'CRITICAL: unhandled error in outbox processor');
    });
  }
}
```

---

## Outbox Processor — Complete Implementation

```typescript
async function processRecord(record: Outbox): Promise<void> {
  // Increment attempts BEFORE calling HCM — inside BEGIN IMMEDIATE
  await dataSource.transaction('IMMEDIATE', async (manager) => {
    await manager.getRepository(Outbox).increment({ id: record.id }, 'attempts', 1);
    await manager.getRepository(Outbox).update(record.id, {
      status: 'PROCESSING',
      lastAttemptedAt: new Date().toISOString(),
    });
  });

  // Re-read with updated attempts count
  const current = await outboxRepo.findOneOrFail({ where: { id: record.id } });

  // Safety guard: should not reach MAX_ATTEMPTS+1, but guard anyway
  if (current.attempts > MAX_OUTBOX_ATTEMPTS) {
    await markFailed(current, 'SAFETY_GUARD_EXCEEDED');
    return;
  }

  // Call HCM
  const result = await callHcm(
    () => buildHcmCall(current),
    `outbox:${current.eventType}:${current.requestId}`
  );

  if (result.success || (result.reason === 'CLIENT_ERROR' && result.statusCode === 409)) {
    // SUCCESS PATH (200 or 409 duplicate ref)
    await handleSuccess(current, result);
    return;
  }

  if (result.reason === 'CLIENT_ERROR' && result.statusCode !== 409) {
    // HCM REJECTED (4xx non-409) — no retry
    await handleRejection(current, result);
    return;
  }

  // RETRIABLE FAILURE (timeout, 5xx, network error)
  if (current.attempts >= MAX_OUTBOX_ATTEMPTS) {
    await markFailed(current, result.reason);
  } else {
    const delaySeconds = Math.pow(2, current.attempts); // 2^1=2, 2^2=4
    const processAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();
    await dataSource.transaction('IMMEDIATE', async (manager) => {
      await manager.getRepository(Outbox).update(current.id, {
        status: 'PENDING',
        processAfter,
        lastError: result.reason,
      });
    });
    logger.warn({ outboxId: current.id, attempts: current.attempts, nextRetry: processAfter }, 'HCM call failed, scheduled retry');
  }
}


async function handleSuccess(record: Outbox, result: HcmResult): Promise<void> {
  const request = await requestRepo.findOneOrFail({ where: { id: record.requestId } });

  await dataSource.transaction('IMMEDIATE', async (manager) => {
    // Mark outbox DONE
    await manager.getRepository(Outbox).update(record.id, { status: 'DONE' });

    if (record.eventType === OutboxEventType.HCM_DEDUCT) {
      // For deductions: set used_days to HCM's authoritative value (not delta)
      const hcmData = result.data as HcmDeductResponse;

      // Defensive overdraft check (C9)
      const balance = await manager.getRepository(Balance).findOneOrFail({
        where: { employeeId: request.employeeId, locationId: request.locationId, leaveType: request.leaveType }
      });
      const effectiveAvailable = hcmData.newTotalDays - hcmData.newUsedDays - (balance.pendingDays - request.daysRequested);
      if (effectiveAvailable < -0.001) {
        logger.error({ requestId: request.id }, 'CRITICAL_BALANCE_ANOMALY: HCM approved but result shows overdraft');
        // Trigger reversal — create HCM_REVERSE outbox
        await triggerEmergencyReversal(manager, request, hcmData.hcmTransactionId);
        return;
      }

      const oldUsedDays = balance.usedDays;
      const oldPendingDays = balance.pendingDays;

      await manager.getRepository(Balance).update(
        { id: balance.id },
        {
          usedDays:          hcmData.newUsedDays,        // authoritative from HCM
          pendingDays:       balance.pendingDays - request.daysRequested, // remove reservation
          hcmLastUpdatedAt:  hcmData.lastUpdatedAt,
          syncedAt:          new Date().toISOString(),
          updatedAt:         new Date().toISOString(),
        }
      );

      // One change log row per changed field
      await writeBalanceChangeLog(manager, balance, 'used_days', oldUsedDays, hcmData.newUsedDays,
        BalanceChangeSource.REQUEST, request.id, hcmData.lastUpdatedAt);
      await writeBalanceChangeLog(manager, balance, 'pending_days', oldPendingDays,
        balance.pendingDays - request.daysRequested,
        BalanceChangeSource.REQUEST, request.id, hcmData.lastUpdatedAt);

      // Store hcm_transaction_id for potential future reversal
      await manager.getRepository(TimeOffRequest).update(request.id, {
        state:             RequestState.APPROVED,
        lastOutboxEvent:   null,
        hcmTransactionId:  hcmData.hcmTransactionId,
        hcmResponseCode:   result.statusCode,
        hcmResponseBody:   JSON.stringify(result.data),
        updatedAt:         new Date().toISOString(),
      });

      await auditLog(manager, request.id, RequestState.PENDING_HCM, RequestState.APPROVED,
        'HCM_RESPONSE', result.statusCode === 409 ? 'duplicate_ref_treated_as_success' : undefined);

    } else if (record.eventType === OutboxEventType.HCM_REVERSE) {
      // For reversals: set used_days to HCM's authoritative post-reversal value
      const hcmData = result.data as HcmReverseResponse;
      const balance = await manager.getRepository(Balance).findOneOrFail({
        where: { employeeId: request.employeeId, locationId: request.locationId, leaveType: request.leaveType }
      });

      const oldUsedDays = balance.usedDays;
      await manager.getRepository(Balance).update(
        { id: balance.id },
        {
          usedDays:         hcmData.newUsedDays,     // authoritative from HCM
          hcmLastUpdatedAt: hcmData.lastUpdatedAt,
          syncedAt:         new Date().toISOString(),
          updatedAt:        new Date().toISOString(),
        }
      );

      await writeBalanceChangeLog(manager, balance, 'used_days', oldUsedDays, hcmData.newUsedDays,
        BalanceChangeSource.REQUEST, request.id, hcmData.lastUpdatedAt);

      await manager.getRepository(TimeOffRequest).update(request.id, {
        state:           RequestState.CANCELLED,
        lastOutboxEvent: null,
        updatedAt:       new Date().toISOString(),
      });

      await auditLog(manager, request.id, RequestState.CANCELLING, RequestState.CANCELLED, 'HCM_RESPONSE');
    }
  });
}


async function handleRejection(record: Outbox, result: HcmResult): Promise<void> {
  const request = await requestRepo.findOneOrFail({ where: { id: record.requestId } });
  const balance = await balanceRepo.findOneOrFail({
    where: { employeeId: request.employeeId, locationId: request.locationId, leaveType: request.leaveType }
  });

  await dataSource.transaction('IMMEDIATE', async (manager) => {
    await manager.getRepository(Outbox).update(record.id, { status: 'DONE' });

    const oldPendingDays = balance.pendingDays;
    await manager.getRepository(Balance).update(balance.id, {
      pendingDays: balance.pendingDays - request.daysRequested,
      updatedAt: new Date().toISOString(),
    });
    await writeBalanceChangeLog(manager, balance, 'pending_days', oldPendingDays,
      balance.pendingDays - request.daysRequested, BalanceChangeSource.REQUEST, request.id, null);

    await manager.getRepository(TimeOffRequest).update(request.id, {
      state:          RequestState.REJECTED,
      lastOutboxEvent: null,
      hcmResponseCode: result.statusCode,
      hcmResponseBody: JSON.stringify(result.body),
      rejectionReason: result.body?.message ?? 'HCM rejected request',
      updatedAt:       new Date().toISOString(),
    });

    await auditLog(manager, request.id, RequestState.PENDING_HCM, RequestState.REJECTED, 'HCM_RESPONSE', result.body);
  });
}


async function markFailed(record: Outbox, reason: string): Promise<void> {
  const request = await requestRepo.findOneOrFail({ where: { id: record.requestId } });
  const balance = await balanceRepo.findOneOrFail({
    where: { employeeId: request.employeeId, locationId: request.locationId, leaveType: request.leaveType }
  });

  const fromState = record.eventType === OutboxEventType.HCM_DEDUCT
    ? RequestState.PENDING_HCM
    : RequestState.CANCELLING;

  const failureReason = record.eventType === OutboxEventType.HCM_DEDUCT
    ? FailureReason.DEDUCTION_FAILED
    : FailureReason.REVERSAL_FAILED;

  await dataSource.transaction('IMMEDIATE', async (manager) => {
    await manager.getRepository(Outbox).update(record.id, {
      status:   'FAILED',
      lastError: reason,
    });

    const oldPendingDays = balance.pendingDays;
    await manager.getRepository(Balance).update(balance.id, {
      pendingDays: balance.pendingDays - request.daysRequested,
      updatedAt: new Date().toISOString(),
    });
    await writeBalanceChangeLog(manager, balance, 'pending_days', oldPendingDays,
      balance.pendingDays - request.daysRequested, BalanceChangeSource.REQUEST, request.id, null);

    await manager.getRepository(TimeOffRequest).update(request.id, {
      state:           RequestState.FAILED,
      lastOutboxEvent: null,
      failureReason,
      updatedAt:       new Date().toISOString(),
    });

    await auditLog(manager, request.id, fromState, RequestState.FAILED, 'SYSTEM', 'OUTBOX_EXHAUSTED');
  });

  logger.error({
    requestId: request.id,
    employeeId: request.employeeId,
    failureReason,
    attempts: record.attempts,
    lastError: reason,
  }, 'CRITICAL: Request permanently failed after max HCM attempts');
}
```

---

## Failure Scenarios: System Guarantees

### Scenario A: HCM down for 10 minutes
- Fresh balance requests (< 5 min): accepted → outbox queued
- Stale balance requests (≥ 5 min): 503 immediately
- Outbox retries: 2s, 4s after each failure; FAILED after 3rd attempt (~6s total window)
- `pending_days` restored on FAILED — no orphaned reservations

### Scenario B: HCM accepts deduction but response lost
- Outbox retries with same `hcm_external_ref`
- HCM returns 409 → treated as success → APPROVED
- `used_days` set from HCM's 409 response body (must include `newUsedDays`) — OR reconciliation catches the delta

### Scenario C: Batch sync arrives mid-outbox-processing
- `pending_days` is recomputed from live `time_off_request` rows inside the batch's `BEGIN IMMEDIATE` transaction
- Batch's `used_days` reflects HCM-confirmed state only — in-flight not yet confirmed, so correct
- After outbox succeeds: `used_days = hcmResponse.newUsedDays`, `pending_days -= daysRequested` — net effect correct

### Scenario D: SQLite write fails mid-transaction
- SQLite rolls back atomically — `BEGIN IMMEDIATE` provides full ACID
- Outbox NOT created → no HCM call
- Request state NOT changed → client receives 500, retries with same idempotency key
- On retry: `IN_PROGRESS` idempotency row was rolled back too → fresh execution

### Scenario E: Node process crashes during outbox processing
- Outbox record is in `PROCESSING` state
- On restart: `resetStuckRecords()` fires on first poll tick, resets to `PENDING`
- `attempts` was already incremented before the crash, so retry count is accurate
- `time_off_request.state` remains `PENDING_HCM` — correct

### Scenario F: `FAILED → SUBMITTED` retry
- Service validates the request is in `FAILED` state (R7)
- Existing FAILED outbox record is reset: `status=PENDING, attempts=0, processAfter=now()`
- `time_off_request.state = SUBMITTED`, `failure_reason = null`
- The unique partial index `idx_outbox_active` ensures this reset (not a new INSERT) is the only active record
- All inside a single `BEGIN IMMEDIATE` transaction

---

## HCM Call Wrapper

```typescript
async function callHcm<T>(
  fn: () => Promise<AxiosResponse<T>>,
  context: string
): Promise<HcmResult<T>> {
  try {
    const response = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000)
      ),
    ]);
    return { success: true, data: response.data, statusCode: response.status };
  } catch (err: any) {
    if (err.message === 'HCM_TIMEOUT') {
      logger.warn({ context }, 'HCM call timed out after 8s');
      return { success: false, reason: 'TIMEOUT' };
    }
    if (err.response) {
      const { status, data } = err.response;
      logger.warn({ context, status, data }, 'HCM returned error response');
      return {
        success: false,
        reason: status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
        statusCode: status,
        body: data,
      };
    }
    logger.error({ context, message: err.message, code: err.code }, 'HCM network error');
    return { success: false, reason: 'NETWORK_ERROR' };
  }
}
```

---

## Global Exception Filter

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx  = host.switchToHttp();
    const res  = ctx.getResponse<Response>();
    const req  = ctx.getRequest<Request>();

    if (exception instanceof DomainException) {
      res.status(exception.statusCode).json({
        error:     exception.code,
        message:   exception.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // SQLite BUSY — map to 503
    if ((exception as any)?.code === 'SQLITE_BUSY') {
      res.status(503).json({
        error:     'DATABASE_BUSY',
        message:   'System is under load. Please retry in a moment.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    logger.error({ exception, path: req.url }, 'Unhandled exception');
    res.status(500).json({
      error:     'INTERNAL_ERROR',
      message:   'An unexpected error occurred',
      timestamp: new Date().toISOString(),
    });
  }
}
```

**Domain exceptions:**
- `InsufficientBalanceException` (422)
- `InvalidStateTransitionException` (409) — includes `CANNOT_CANCEL_WHILE_PROCESSING` (409)
- `HcmUnavailableException` (503)
- `IdempotencyInProgressException` (409)
- `BalanceNotFoundError` (404)
- `RequestNotFoundError` (404)
- `DatabaseBusyException` (503) — wraps SQLITE_BUSY