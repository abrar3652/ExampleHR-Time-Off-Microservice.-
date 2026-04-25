# HCM Mock — 05: Batch Sync Design

---

## Batch Modes

The Mock HCM supports two batch sync modes, both active:

| Mode | Direction | Trigger |
|---|---|---|
| Pull | ReadyOn polls `GET /api/hcm/batch/balances` | ReadyOn's batch pull worker (every 60 min) |
| Push | Mock HCM POSTs to ReadyOn `POST /sync/batch/balances` | Mock HCM's push job (configurable interval) |

---

## Pull Endpoint: `GET /api/hcm/batch/balances`

### Pagination

- Default page size: 100 records
- Cursor-based pagination (not offset)
- Cursor = base64-encoded `{ lastId: string, generatedAt: string }`

```json
// First page request
GET /api/hcm/batch/balances?since=2025-01-15T00:00:00Z&limit=100

// Response
{
  "batchId": "batch-abc-001",
  "generatedAt": "2025-01-15T10:00:00Z",
  "records": [ ...100 records... ],
  "hasMore": true,
  "nextCursor": "eyJsYXN0SWQiOiJlbXAtMTAwIn0=",
  "totalCount": 250
}

// Second page request
GET /api/hcm/batch/balances?cursor=eyJsYXN0SWQiOiJlbXAtMTAwIn0=

// Response
{
  "batchId": "batch-abc-001",    ← same batchId (same snapshot)
  "generatedAt": "2025-01-15T10:00:00Z",
  "records": [ ...100 records... ],
  "hasMore": true,
  "nextCursor": "eyJsYXN0SWQiOiJlbXAtMjAwIn0=",
  "totalCount": 250
}
```

### Snapshot Semantics

- All pages of a single batch share the same `batchId` and `generatedAt`
- The batch is a point-in-time snapshot taken when the first page was requested
- Subsequent page requests with a cursor return data from that snapshot (stored in `hcm_batch_snapshot` table)
- Snapshots expire after 10 minutes

```sql
CREATE TABLE hcm_batch_snapshot (
  batch_id        TEXT NOT NULL,
  record_index    INTEGER NOT NULL,
  record_data     TEXT NOT NULL,  -- JSON
  generated_at    TEXT NOT NULL,
  expires_at      TEXT NOT NULL,
  PRIMARY KEY (batch_id, record_index)
);
```

### `since` Filtering

- `since` parameter filters records where `hcm_balance.last_updated_at > since`
- If no `since` provided: returns all records
- Records updated AFTER snapshot generation are NOT included (snapshot is frozen at `generatedAt`)

---

## Push Job (HCM → ReadyOn)

The Mock HCM has a configurable push job.

### Configuration

```typescript
// Activated via: POST /__control/behavior
// { "endpoint": "batch_push", "behavior": "enable", "interval_seconds": 60 }

// The push job:
// 1. Generates a batch snapshot (same as pull, no `since` filter by default)
// 2. POSTs to ReadyOn: POST http://localhost:3000/sync/batch/balances
// 3. Logs success or failure in hcm_call_log
// 4. On ReadyOn 500: logs error, does NOT retry (ReadyOn must have received it or not)
```

### Push Payload

Identical to the pull response format:
```json
{
  "batchId": "hcm-push-batch-uuid",
  "generatedAt": "2025-01-15T08:00:00Z",
  "records": [ ... ]
}
```

### Intentional Push Behavior for Tests

- Push job can be configured to send batches with artificially old `hcmLastUpdatedAt` values:
  ```
  POST /__control/behavior
  { "endpoint": "batch_push", "behavior": "stale_timestamps", "count": 1 }
  ```
  This triggers a push where all records have `hcmLastUpdatedAt` set 2 hours in the past, verifying ReadyOn skips them (R6).

---

## Batch-Related Invariants in Mock HCM

1. `hcmLastUpdatedAt` in batch records always equals `hcm_balance.last_updated_at` at snapshot time — no synthesis.
2. `usedDays` in batch records reflects only HCM-confirmed deductions — NOT ReadyOn's in-flight requests.
3. Multiple batch requests with the same `since` value produce the same records (deterministic).
4. Batch records are never partial — a record always has all required fields or is excluded.

---

## Independent Drift During Batch Window

To simulate realistic HCM behavior:
- Between two batch generations, the drift job (Rule B1 in behavior-rules.md) may update some balances
- The NEXT batch will include the updated `last_updated_at` for those records
- The previous batch's records for those employees will have stale timestamps
- ReadyOn must apply R6 correctly to handle this without skipping the new data

**Test scenario:**
1. ReadyOn processes batch at T=0 (all records applied)
2. HCM drift job updates emp-001 at T=3min
3. ReadyOn processes batch at T=60min
4. Batch at T=60min has newer `hcmLastUpdatedAt` for emp-001 → applied ✓
5. Old batch (if received late for some reason) would be skipped ✓
