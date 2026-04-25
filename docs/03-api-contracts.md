# 03 — API Contracts

> All endpoints are REST, JSON body, UTF-8.
> Base URL: `http://localhost:3000`
> All mutating endpoints require `Idempotency-Key: <UUIDv4>` header.
> All timestamps in responses are UTC ISO-8601.

---

## Authentication (Stub for Take-Home)

All endpoints require header: `X-Employee-Id: <employee_id>`
Manager-only endpoints additionally require: `X-Role: manager`
These are not validated cryptographically in this scope — they are trusted headers.

---

## 1. Balance Endpoints

### GET `/balances/:employeeId/:locationId/:leaveType`

Returns the current balance. Triggers a real-time HCM fetch if `synced_at` is older than 5 minutes.

**Response 200:**
```json
{
  "employeeId": "emp-001",
  "locationId": "loc-nyc",
  "leaveType": "ANNUAL",
  "totalDays": 20.0,
  "usedDays": 5.0,
  "pendingDays": 2.0,
  "availableDays": 13.0,
  "syncedAt": "2025-01-15T10:00:00Z",
  "hcmLastUpdatedAt": "2025-01-15T09:55:00Z"
}
```

**Response 503** (HCM unavailable AND local balance stale):
```json
{
  "error": "HCM_UNAVAILABLE",
  "message": "Balance data is stale and HCM is unreachable. Please retry later.",
  "staleSince": "2025-01-15T09:00:00Z"
}
```

**Response 404** (no balance record exists locally and HCM returns 404):
```json
{
  "error": "BALANCE_NOT_FOUND",
  "message": "No balance found for employee emp-001 at location loc-nyc for leave type ANNUAL"
}
```

---

## 2. Time-Off Request Endpoints

### POST `/time-off/requests`

Creates and submits a time-off request.

**Required headers:** `Idempotency-Key`, `X-Employee-Id`

**Request body:**
```json
{
  "locationId": "loc-nyc",
  "leaveType": "ANNUAL",
  "startDate": "2025-02-10",
  "endDate": "2025-02-12",
  "daysRequested": 3.0,
  "note": "Family vacation"
}
```

**Validation rules (enforced before any DB write):**
- `startDate` < `endDate`
- `daysRequested` > 0, must be multiple of 0.5
- `leaveType` must be valid enum value
- `daysRequested` must match computed business days between `startDate` and `endDate`

**Response 202 Accepted:**
```json
{
  "requestId": "req-uuid-here",
  "state": "SUBMITTED",
  "message": "Request submitted. Awaiting HCM confirmation.",
  "estimatedResolutionSeconds": 30
}
```

**Response 409 Conflict** (idempotency key already used with different body):
```json
{
  "error": "IDEMPOTENCY_CONFLICT",
  "message": "This idempotency key was already used with different parameters."
}
```

**Response 200 OK** (idempotency key already used, same body — replay):
```json
{
  "requestId": "req-uuid-here",
  "state": "APPROVED",
  "replayed": true
}
```

**Response 422** (validation failure):
```json
{
  "error": "VALIDATION_FAILED",
  "fields": [
    { "field": "daysRequested", "message": "Must be a multiple of 0.5" }
  ]
}
```

**Response 503** (HCM unavailable AND local balance stale):
```json
{
  "error": "BALANCE_UNVERIFIABLE",
  "message": "Cannot validate balance. HCM is unreachable and local data is stale."
}
```

---

### GET `/time-off/requests/:requestId`

Returns request state and details.

**Response 200:**
```json
{
  "requestId": "req-uuid-here",
  "employeeId": "emp-001",
  "locationId": "loc-nyc",
  "leaveType": "ANNUAL",
  "startDate": "2025-02-10",
  "endDate": "2025-02-12",
  "daysRequested": 3.0,
  "state": "APPROVED",
  "hcmExternalRef": "req-uuid-here",
  "rejectionReason": null,
  "createdAt": "2025-01-15T10:00:00Z",
  "updatedAt": "2025-01-15T10:00:35Z"
}
```

---

### GET `/time-off/requests`

Lists requests for an employee. Filtered by `X-Employee-Id` header.

**Query params:** `state` (optional), `page` (default 1), `limit` (default 20)

**Response 200:**
```json
{
  "data": [ /* array of request objects */ ],
  "total": 42,
  "page": 1,
  "limit": 20
}
```

---

### POST `/time-off/requests/:requestId/cancel`

**Required headers:** `Idempotency-Key`, `X-Employee-Id`

Only allowed if state is `SUBMITTED` or `APPROVED`.

**Response 200:**
```json
{
  "requestId": "req-uuid-here",
  "state": "CANCELLED",
  "message": "Request cancelled successfully."
}
```

**Response 409** (invalid state transition):
```json
{
  "error": "INVALID_STATE_TRANSITION",
  "currentState": "APPROVED",
  "attemptedTransition": "CANCEL",
  "message": "Cannot cancel a request in APPROVED state after HCM deduction. A reversal has been initiated."
}
```

> Note: Cancelling an APPROVED request triggers `HCM_REVERSE` outbox event. State moves to `PENDING_HCM` until reversal confirmed.

---

### POST `/time-off/requests/:requestId/approve` (Manager only)

**Required headers:** `Idempotency-Key`, `X-Employee-Id`, `X-Role: manager`

Only useful for a manager override in FAILED state to force-retry.

**Response 202:**
```json
{
  "requestId": "req-uuid-here",
  "state": "PENDING_HCM",
  "message": "Approval re-submitted to HCM."
}
```

---

## 3. Sync Endpoints

### POST `/sync/batch/balances`

Receives a batch push from HCM. Called by HCM, not clients.

**Request body:**
```json
{
  "batchId": "batch-2025-01-15-001",
  "generatedAt": "2025-01-15T08:00:00Z",
  "records": [
    {
      "employeeId": "emp-001",
      "locationId": "loc-nyc",
      "leaveType": "ANNUAL",
      "totalDays": 20.0,
      "usedDays": 5.0,
      "hcmLastUpdatedAt": "2025-01-15T07:55:00Z"
    }
  ]
}
```

**Response 200:**
```json
{
  "batchId": "batch-2025-01-15-001",
  "processed": 150,
  "skipped": 12,
  "failed": 0,
  "message": "Batch applied. 12 records skipped (older than local data)."
}
```

---

### GET `/sync/reconciliation/status`

Returns the latest reconciliation run summary.

**Response 200:**
```json
{
  "runId": "recon-run-uuid",
  "ranAt": "2025-01-15T10:15:00Z",
  "totalChecked": 300,
  "driftsDetected": 3,
  "autoCorrected": 1,
  "pendingReview": 2
}
```

---

## 4. Admin / Health

### GET `/health`

**Response 200:**
```json
{
  "status": "ok",
  "hcmReachable": true,
  "outboxPendingCount": 2,
  "lastBatchSyncAt": "2025-01-15T08:00:00Z",
  "lastReconciliationAt": "2025-01-15T10:15:00Z"
}
```

---

## Error Response Schema (All Errors)

```json
{
  "error": "ERROR_CODE",
  "message": "Human readable message",
  "requestId": "req-uuid if applicable",
  "timestamp": "2025-01-15T10:00:00Z"
}
```

## Standard HTTP Status Codes Used

| Code | When |
|---|---|
| 200 | Success (read or idempotent replay) |
| 202 | Accepted (async processing started) |
| 400 | Malformed request / missing fields |
| 404 | Resource not found |
| 409 | Idempotency conflict or invalid state transition |
| 422 | Business validation failure |
| 503 | HCM unavailable, balance unverifiable |
