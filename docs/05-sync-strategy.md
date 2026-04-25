# 05 — Sync Strategy

> Two sync paths exist: real-time (per-request) and batch (scheduled). Both must coexist without corrupting each other.

---

## Sync Modes

| Mode | Trigger | Direction | Frequency | Enforces R6 |
|---|---|---|---|---|
| Real-Time Fetch | Balance read with expired TTL | HCM → Local | On-demand | Yes (via `hcm_last_updated_at`) |
| Real-Time Write | Request approval (outbox) | Local → HCM | Per-request | N/A (write, not read) |
| Batch Push | HCM POSTs to our endpoint | HCM → Local | HCM-scheduled (hourly) | Yes |
| Batch Pull | Our worker polls HCM | HCM → Local | Every 60 min (fallback) | Yes |
| Reconciliation | Background worker | HCM → Local (read) | Every 15 min | Yes (auto-correct gated by R13) |

---

## Real-Time Fetch (Balance Cache Refresh)

**Trigger:** `BalanceService.getOrFetchBalance()` when `balance.synced_at < now() - 5min` OR when no local record exists.

**Steps:**
1. Call `GET /api/hcm/balance/:employeeId/:locationId/:leaveType` (8s timeout via Promise.race)
2. On 200: upsert local `balance` record inside `BEGIN IMMEDIATE` transaction:
   - Set `total_days` = response.totalDays
   - Set `used_days` = response.usedDays
   - Set `hcm_last_updated_at` = response.lastUpdatedAt
   - Set `synced_at` = now() (local clock — the only place local clock is used for synced_at)
   - Write one `balance_change_log` row per field that changed (source: REAL_TIME_SYNC)
3. On 404: propagate 404 — do not create a local record.
4. On 503 / timeout: do NOT update local record.
   - If local record exists and `synced_at` is within TTL: return local record, log warning.
   - If local record is stale or absent: throw `HcmUnavailableException` (503).

**Rule:** The real-time fetch is the ONLY path that sets `synced_at` from local clock. All `hcm_last_updated_at` values come from HCM response bodies — never from local clock.

---

## Batch Sync (Apply Algorithm)

Applied identically whether the batch arrives via push (`POST /sync/batch/balances`) or pull.

```
function applyBatch(records: BatchRecord[], batchId: string, generatedAt: string):
  processedCount = 0
  skippedCount = 0
  failedCount = 0

  for each record in records:
    try:
      applyOneRecord(record, batchId)
      processedCount++
    catch err:
      log ERROR { batchId, record, err }
      failedCount++
      continue   // one bad record does NOT stop the batch

  // Checkpoint updated ONLY after all records in this batch page are processed
  update sync_checkpoint:
    last_batch_id    = batchId
    last_batch_at    = generatedAt   // HCM's clock, NOT local now()
    last_record_count = processedCount
    updated_at       = now()

  return { processed: processedCount, skipped: skippedCount, failed: failedCount }


function applyOneRecord(record: BatchRecord, batchId: string):
  // All steps below are inside a single BEGIN IMMEDIATE transaction
  BEGIN IMMEDIATE

    existing = SELECT * FROM balance
               WHERE employee_id=record.employeeId
                 AND location_id=record.locationId
                 AND leave_type=record.leaveType

    if existing is null:
      INSERT into balance (all fields from record, pending_days=0, synced_at=now())
      write balance_change_log rows (one per field, source: BATCH_SYNC, source_ref: batchId)
      COMMIT
      return

    // R6: Only apply if HCM data is strictly newer
    if record.hcmLastUpdatedAt <= existing.hcm_last_updated_at:
      skippedCount++
      COMMIT
      return

    // Recompute pending_days from in-flight requests INSIDE this transaction
    // This is the critical section that prevents TOCTOU on pending_days
    pendingDays = SELECT COALESCE(SUM(days_requested), 0)
                  FROM time_off_request
                  WHERE employee_id = record.employeeId
                    AND location_id = record.locationId
                    AND leave_type  = record.leaveType
                    AND state IN ('SUBMITTED', 'PENDING_HCM', 'CANCELLING')

    // Capture old values for change log
    oldTotalDays = existing.total_days
    oldUsedDays  = existing.used_days

    UPDATE balance SET
      total_days          = record.totalDays,
      used_days           = record.usedDays,
      pending_days        = pendingDays,     // recomputed, NOT from batch
      hcm_last_updated_at = record.hcmLastUpdatedAt,
      synced_at           = now(),
      updated_at          = now()
    WHERE id = existing.id

    // Write one change log row per changed field
    if oldTotalDays != record.totalDays:
      write balance_change_log(field: total_days, old: oldTotalDays, new: record.totalDays,
                                source: BATCH_SYNC, source_ref: batchId,
                                hcm_timestamp: record.hcmLastUpdatedAt)
    if oldUsedDays != record.usedDays:
      write balance_change_log(field: used_days, old: oldUsedDays, new: record.usedDays,
                                source: BATCH_SYNC, source_ref: batchId,
                                hcm_timestamp: record.hcmLastUpdatedAt)

  COMMIT
```

**Why `pending_days` recomputation is inside the transaction:** Between reading the balance and writing the update, a new SUBMITTED request could increment `pending_days`. Running the SUM inside `BEGIN IMMEDIATE` prevents any concurrent write from being committed between the read and the update — SQLite serializes writers, so no concurrent SUBMITTED insert can interleave.

**Why checkpoint uses `generatedAt` not `now()`:** The `since` parameter on the next batch pull must match the HCM's internal clock used for `last_updated_at`. Using local `now()` would cause clock skew to miss records that HCM updated between `generatedAt` and local `now()`.

---

## Batch Pull Worker

```
Every 60 minutes:
  lastBatchAt = sync_checkpoint.last_batch_at  // HCM clock value
  currentBatchId = null
  currentGeneratedAt = null
  cursor = null

  loop:
    response = GET /api/hcm/batch/balances
                 ?since=<lastBatchAt>
                 &cursor=<cursor>
                 &limit=500
    (with 8s timeout per page request)

    if HCM GET fails:
      log WARN { reason: 'batch pull failed', attempt }
      do NOT update sync_checkpoint
      return  // retry at next scheduled interval; do not apply partial

    if response.records.length == 0 AND cursor is null:
      return  // no new data since last sync

    currentBatchId    = response.batchId
    currentGeneratedAt = response.generatedAt

    applyBatch(response.records, currentBatchId, currentGeneratedAt)
    // Note: applyBatch updates checkpoint per page — this is intentional for pull
    // because each page is independently safe (R6 guards against stale overwrites)

    if not response.hasMore:
      break
    cursor = response.nextCursor
```

**On partial batch (connection lost mid-pagination):**
- Records already applied in earlier pages remain applied — they are individually safe per R6.
- The checkpoint reflects the `generatedAt` of the successfully applied pages.
- The incomplete batch will be retried next interval with `since` pointing to the last committed checkpoint.
- No rollback of already-applied pages. R6 ensures re-applying them is a no-op (timestamps won't be newer).

---

## Reconciliation Worker

**Interval:** Every 15 minutes via NestJS `@Cron('*/15 * * * *')`

**Algorithm:**
```
runId = UUID()
log INFO { runId, event: 'reconciliation_start' }

allLocalBalances = SELECT * FROM balance

for each localBalance in allLocalBalances:
  hcmResult = callHcm(GET /api/hcm/balance/:emp/:loc/:lt, timeout=8s)

  if hcmResult.success == false:
    log WARN { runId, employee: localBalance.employee_id, reason: 'hcm_fetch_failed' }
    continue  // skip this record; do NOT mark as drifted on HCM failure

  hcmBalance = hcmResult.data

  // --- Check total_days drift ---
  totalDrift = hcmBalance.totalDays - localBalance.total_days
  if abs(totalDrift) > 0.001:
    write reconciliation_log {
      runId, drift_field: 'total_days',
      local_value: localBalance.total_days,
      hcm_value: hcmBalance.totalDays,
      adjusted_local: localBalance.total_days,  // no adjustment needed for total_days
      drift: totalDrift
    }
    maybeAutoCorrect(localBalance, 'total_days', hcmBalance.totalDays, hcmBalance.lastUpdatedAt, runId)

  // --- Check used_days drift ---
  // CRITICAL: Adjust local used_days by adding pending_days before comparing.
  // HCM does not know about our in-flight (SUBMITTED/PENDING_HCM/CANCELLING) reservations.
  // Without this adjustment, every in-flight request would appear as used_days drift.
  adjustedLocalUsed = localBalance.used_days + localBalance.pending_days
  usedDrift = hcmBalance.usedDays - adjustedLocalUsed
  if abs(usedDrift) > 0.001:
    write reconciliation_log {
      runId, drift_field: 'used_days',
      local_value: localBalance.used_days,
      hcm_value: hcmBalance.usedDays,
      adjusted_local: adjustedLocalUsed,
      drift: usedDrift
    }
    // Do NOT auto-correct used_days — only total_days is auto-correctable.
    // used_days drift requires manual review because it may indicate
    // an external HCM deduction or the FS-3 silent success scenario.
    mark reconciliation_log entry resolution = 'MANUAL_REVIEW'

log INFO { runId, event: 'reconciliation_complete', checked: allLocalBalances.length }


function maybeAutoCorrect(localBalance, field, hcmValue, hcmLastUpdatedAt, runId):
  driftAgeMinutes = (now() - localBalance.synced_at) in minutes
  if driftAgeMinutes > 15 AND hcmLastUpdatedAt > localBalance.hcm_last_updated_at:
    BEGIN IMMEDIATE
      UPDATE balance SET total_days = hcmValue,
                         hcm_last_updated_at = hcmLastUpdatedAt,
                         updated_at = now()
      WHERE id = localBalance.id
      write balance_change_log(field: total_days, source: AUTO_RECONCILE, source_ref: runId)
      mark reconciliation_log entry resolved=1, resolution='AUTO_CORRECTED', resolved_at=now()
    COMMIT
  else:
    mark reconciliation_log entry resolved=0, resolution='MANUAL_REVIEW'
    log WARN { runId, employee: localBalance.employee_id, field, drift }
```

---

## Conflict Precedence Rules

| Scenario | Rule |
|---|---|
| Batch record with newer `hcm_last_updated_at` than local | Apply batch (inside BEGIN IMMEDIATE) |
| Batch record with older/equal `hcm_last_updated_at` than local | Skip |
| Real-time fetch returns older timestamp than local | Skip update (log warning) |
| Real-time fetch returns newer timestamp than local | Apply update |
| Reconciliation: `total_days` drift, age > 15min, HCM newer | Auto-correct |
| Reconciliation: `total_days` drift, age ≤ 15min OR HCM not newer | Log MANUAL_REVIEW |
| Reconciliation: `used_days` drift (any) | Log MANUAL_REVIEW — never auto-correct |
| Batch push and batch pull arrive concurrently | Per-record BEGIN IMMEDIATE serializes; R6 ensures idempotent outcome |
| Batch arrives while outbox is mid-flight for same employee | pending_days recomputed inside transaction — correctly includes in-flight request |