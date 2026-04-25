# AGENT RULES — TIME-OFF MICROSERVICE

## CONTEXT

- Distributed system (NOT CRUD)
- HCM = source of truth
- Local service = cache + request lifecycle
- Correctness > speed

---

## SOURCE OF TRUTH

- ALWAYS read relevant `/docs/*.md` before any step
- `/docs` overrides everything
- Do NOT assume behavior not defined in docs

---

## IMPLEMENTATION RULES

- One step = one change = one commit
- Never combine steps
- Follow prompt EXACTLY
- Keep implementations minimal and focused

---

## VERIFICATION (MANDATORY)

- Never skip verification
- If verification fails → FIX before proceeding
- Do NOT move forward with failing tests

---

## TESTING RULES

- Tests must exist BEFORE or WITH implementation
- Required:
  - unit
  - integration
  - concurrency
  - failure scenarios
- Mock HCM MUST be running for integration/concurrency tests
- Provide Jest `globalSetup` to start HCM mock

---

## SYSTEM CONSTRAINTS

- No direct HCM calls inside transactions
- Use Outbox for all external effects
- Ensure idempotency (no duplicate deductions)
- Never allow negative balance
- Never rely on stale data
- Handle HCM failures defensively

---

## CONCURRENCY

- Scope: (employeeId, locationId, leaveType)
- Must be safe under concurrent requests
- Use proper locking/transactions (per docs)

---

## FAILURE HANDLING

Assume HCM can:
- timeout
- fail partially
- return inconsistent data

System must remain correct.

---

## CODE QUALITY GATE

- If code violates `00-rules.md` → REJECT
- Re-prompt with explicit rule reference

---

## PRIORITY ORDER

1. Correctness
2. Consistency
3. Failure safety
4. Simplicity

Never trade correctness for speed.