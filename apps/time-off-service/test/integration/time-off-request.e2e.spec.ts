import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { LeaveType } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { Outbox } from '../../src/modules/time-off/entities/outbox.entity';
import { RequestAuditLog } from '../../src/modules/time-off/entities/request-audit-log.entity';
import { TimeOffRequest } from '../../src/modules/time-off/entities/time-off-request.entity';

describe('POST /time-off/requests (creation cases)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    await app.init();
    dataSource = app.get(DataSource);

    const now = new Date().toISOString();
    await dataSource.getRepository(Balance).delete({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    await dataSource.getRepository(Balance).save({
      id: 'bal-emp001',
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
      totalDays: 20,
      usedDays: 5,
      pendingDays: 0,
      hcmLastUpdatedAt: now,
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('creates request + outbox + pending increment + audit, and replays idempotent duplicate', async () => {
    const idempotencyKey = randomUUID();
    const body = {
      locationId: 'loc-nyc',
      leaveType: 'ANNUAL',
      startDate: '2025-02-10',
      endDate: '2025-02-12',
      daysRequested: 3,
    };

    const r1 = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(r1.status).toBe(202);
    expect(r1.body.state).toBe('SUBMITTED');
    expect(r1.body.requestId).toBeTruthy();

    const requestRow = await dataSource.getRepository(TimeOffRequest).findOneBy({ id: r1.body.requestId });
    expect(['SUBMITTED', 'PENDING_HCM', 'APPROVED']).toContain(requestRow?.state);

    const outboxRow = await dataSource.getRepository(Outbox).findOneBy({ requestId: r1.body.requestId });
    expect(outboxRow?.status).toMatch(/PENDING|PROCESSING|DONE/);
    expect(outboxRow?.eventType).toBe('HCM_DEDUCT');

    const balanceRows = await dataSource.query(
      "SELECT pending_days FROM balance WHERE employee_id = ? AND location_id = ? AND leave_type = ?",
      ['emp-001', 'loc-nyc', LeaveType.ANNUAL],
    );
    expect(balanceRows[0]?.pending_days).toBe(3);

    const audit = await dataSource.getRepository(RequestAuditLog).findOneBy({ requestId: r1.body.requestId });
    expect(audit?.toState).toBe('SUBMITTED');

    const r2 = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', idempotencyKey)
      .send(body);

    expect(r2.status).toBe(202);
    expect(r2.body).toEqual(r1.body);

    expect(
      await dataSource.getRepository(TimeOffRequest).countBy({ idempotencyKey }),
    ).toBe(1);
    expect(await dataSource.getRepository(Outbox).countBy({ requestId: r1.body.requestId })).toBe(1);
    expect(await dataSource.getRepository(RequestAuditLog).countBy({ requestId: r1.body.requestId })).toBeGreaterThanOrEqual(1);
  });
});

