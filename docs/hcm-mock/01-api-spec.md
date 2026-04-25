# HCM Mock — 01: API Specification

> The Mock HCM runs as a standalone NestJS application on port 4000.
> It maintains its own SQLite database. It is NOT a stub — it has real logic, real state, and intentional imperfections.

---

## Base URL: `http://localhost:4000`

---

## Real-Time Endpoints

### GET `/api/hcm/balance/:employeeId/:locationId/:leaveType`

Returns the HCM-authoritative balance for the given dimensions.

**Response 200:**
```json
{
  "employeeId": "emp-001",
  "locationId": "loc-nyc",
  "leaveType": "ANNUAL",
  "totalDays": 20.0,
  "usedDays": 5.0,
  "lastUpdatedAt": "2025-01-15T09:55:00Z"
}
```

**Response 404:**
```json
{
  "error": "EMPLOYEE_BALANCE_NOT_FOUND",
  "message": "No balance record found for the given dimensions"
}
```

**Behavior notes:**
- May randomly delay response 500ms–3000ms (controlled by chaos settings)
- May randomly return 503 (controlled by chaos settings)
- `lastUpdatedAt` is the HCM-internal clock, NOT server time (can be advanced via control API)

---

### POST `/api/hcm/timeoff/deduct`

Attempts to deduct leave from an employee's balance.

**Request body:**
```json
{
  "externalRef": "req-uuid-from-readyon",
  "employeeId": "emp-001",
  "locationId": "loc-nyc",
  "leaveType": "ANNUAL",
  "days": 3.0,
  "startDate": "2025-02-10",
  "endDate": "2025-02-12"
}
```

**Response 200 (success):**
```json
{
  "externalRef": "req-uuid-from-readyon",
  "hcmTransactionId": "hcm-txn-uuid",
  "newUsedDays": 8.0,
  "newTotalDays": 20.0,
  "lastUpdatedAt": "2025-01-15T10:05:00Z",
  "message": "Deduction applied successfully"
}
```

**Response 409 (duplicate externalRef):**
```json
{
  "error": "DUPLICATE_EXTERNAL_REF",
  "externalRef": "req-uuid-from-readyon",
  "message": "This externalRef has already been processed",
  "existingTransaction": "hcm-txn-uuid"
}
```

**Response 422 (insufficient balance):**
```json
{
  "error": "INSUFFICIENT_BALANCE",
  "available": 2.0,
  "requested": 3.0,
  "message": "Employee does not have sufficient balance"
}
```

**Response 400 (invalid dimensions):**
```json
{
  "error": "INVALID_DIMENSIONS",
  "message": "No balance policy found for employee emp-001 at location loc-nyc for leave type ANNUAL"
}
```

**Behavior notes (intentional imperfections — see 04-failure-scenarios.md):**
- 5% of the time, returns 200 but does NOT actually apply the deduction (silent failure mode)
- 3% of the time, returns 500 even on valid requests
- When configured in "unreliable validation" mode: may return 200 even when balance is insufficient
- May delay 1s–5s randomly

---

### POST `/api/hcm/timeoff/reverse`

Reverses a previously applied deduction.

**Request body:**
```json
{
  "externalRef": "req-uuid-from-readyon",
  "hcmTransactionId": "hcm-txn-uuid",
  "employeeId": "emp-001",
  "reason": "Employee cancelled request"
}
```

**Response 200:**
```json
{
  "externalRef": "req-uuid-from-readyon",
  "reversalTransactionId": "hcm-rev-txn-uuid",
  "restoredDays": 3.0,
  "newUsedDays": 5.0,
  "lastUpdatedAt": "2025-01-15T11:00:00Z"
}
```

**Response 404 (transaction not found):**
```json
{
  "error": "TRANSACTION_NOT_FOUND",
  "hcmTransactionId": "hcm-txn-uuid",
  "message": "No HCM transaction found with the given ID"
}
```

**Response 409 (already reversed):**
```json
{
  "error": "ALREADY_REVERSED",
  "message": "This transaction has already been reversed"
}
```

---

## Batch Endpoints

### POST `/api/hcm/batch/balances` (HCM pushes to ReadyOn)

This endpoint is ON THE READYON SERVICE (not HCM) — documented in 03-api-contracts.md.
HCM mock has a job that calls this endpoint.

---

### GET `/api/hcm/batch/balances`

ReadyOn pulls a snapshot of all or updated balances.

**Query params:**
- `since` (optional ISO-8601): only return records updated after this time
- `cursor` (optional): pagination cursor from previous response
- `limit` (optional, default 100, max 500)

**Response 200:**
```json
{
  "batchId": "hcm-batch-uuid",
  "generatedAt": "2025-01-15T10:00:00Z",
  "records": [
    {
      "employeeId": "emp-001",
      "locationId": "loc-nyc",
      "leaveType": "ANNUAL",
      "totalDays": 20.0,
      "usedDays": 5.0,
      "hcmLastUpdatedAt": "2025-01-15T09:55:00Z"
    }
  ],
  "hasMore": false,
  "nextCursor": null,
  "totalCount": 1
}
```

---

## Control API (`/__control`) — Test Use Only

### POST `/__control/behavior`

Set chaos behavior for subsequent calls.

**Request body:**
```json
{
  "endpoint": "GET /api/hcm/balance",
  "behavior": "timeout",
  "count": 2
}
```

`behavior` options: `"timeout"` | `"500"` | `"409"` | `"slow"` | `"silent_success"` | `"invalid_validation"`

`endpoint` options: `"balance_get"` | `"deduct"` | `"reverse"` | `"batch_get"`

`count`: how many subsequent calls are affected (-1 = indefinite)

---

### POST `/__control/balance`

Set or update a balance in Mock HCM.

**Request body:**
```json
{
  "employeeId": "emp-001",
  "locationId": "loc-nyc",
  "leaveType": "ANNUAL",
  "totalDays": 20.0,
  "usedDays": 0.0,
  "hcmLastUpdatedAt": "2025-01-15T09:00:00Z"
}
```

---

### POST `/__control/drift`

Independently update a balance in HCM (simulates work anniversary / year reset).

**Request body:**
```json
{
  "employeeId": "emp-001",
  "locationId": "loc-nyc",
  "leaveType": "ANNUAL",
  "newTotalDays": 25.0,
  "reason": "work_anniversary"
}
```

---

### POST `/__control/advance-clock`

Advance the HCM internal clock (affects `lastUpdatedAt` values).

**Request body:**
```json
{ "milliseconds": 600000 }
```

---

### GET `/__control/call-log`

Returns history of all calls received with timestamps and responses.

---

### POST `/__control/reset`

Resets Mock HCM to clean state (clears balances, call log, chaos settings).
