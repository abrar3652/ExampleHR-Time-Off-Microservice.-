# ExampleHR Time-Off Microservice

## Overview
ExampleHR is a two-service time-off platform where `time-off-service` manages request workflows and local operational state, while `hcm-mock` simulates the external HCM authority for balances and deductions. The system uses strict state transitions, idempotency, outbox retries, and reconciliation to keep request outcomes correct under failures and concurrency.

## Architecture
The solution runs as two independent services: `time-off-service` (port 3000) and `hcm-mock` (port 4000). The time-off service exposes APIs, stores local operational data in SQLite, and performs asynchronous HCM writes through an outbox worker. The mock HCM exposes real HTTP endpoints and control APIs for deterministic failure simulation and integration testing. For full technical details, see [`docs/TRD.html`](docs/TRD.html).

```text
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

## Prerequisites
- Node.js 18+
- npm

## Running Locally

### Start Mock HCM
```bash
cd apps/hcm-mock && npm install && npm run start:dev
```

### Start Time-Off Service
```bash
cd apps/time-off-service && npm install && npm run start:dev
```

### Run the Demo
```bash
bash scripts/demo.sh
```

## Running Tests

### All tests with coverage
```bash
cd apps/time-off-service && npm test -- --coverage
```

### Specific suites
```bash
npm test -- concurrent-requests.spec.ts
npm test -- outbox-retry.spec.ts
npm test -- reconciliation.e2e.spec.ts
```

## Test Coverage
See [`COVERAGE.md`](COVERAGE.md) for the full coverage report.  
Current: 86%+ lines overall, 100% branch on state machine, 98%+ on outbox processor.

## Design Documents
| Document | Description |
|---|---|
| `docs/TRD.html` | Full Technical Requirements Document |
| `docs/00-rules.md` | System invariants — must be read before any code change |
| `docs/08-test-strategy.md` | Test strategy and coverage requirements |

## Key Design Decisions
- HCM is the sole source of truth for balances
- Outbox pattern with SQLite BEGIN IMMEDIATE ensures no double-deduction
- Idempotency enforced at 3 layers: interceptor, DB constraint, HCM externalRef
- CANCELLING state is distinct from PENDING_HCM to disambiguate in-flight operations
