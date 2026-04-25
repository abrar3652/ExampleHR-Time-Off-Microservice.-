import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { LeaveType } from '../../src/domain/enums';
import { Balance } from '../../src/modules/balance/entities/balance.entity';
import { HcmDeductionWriter } from '../../src/modules/hcm-client/hcm-deduction-writer.service';
import { Outbox } from '../../src/modules/time-off/entities/outbox.entity';
import { RequestAuditLog } from '../../src/modules/time-off/entities/request-audit-log.entity';

class MockHcmWriter {
  private behavior: 'ok' | '500' = 'ok';
  private remaining = 0;

  setBehavior(behavior: 'ok' | '500', count: number): void {
    this.behavior = behavior;
    this.remaining = count;
  }

  async deduct(payload: any): Promise<any> {
    if (this.behavior === '500' && this.remaining > 0) {
      this.remaining -= 1;
      return { success: false, reason: 'SERVER_ERROR', statusCode: 500, body: { message: 'boom' } };
    }
    return {
      success: true,
      statusCode: 200,
      data: {
        hcmTransactionId: `txn-${payload.externalRef}`,
        newTotalDays: 20,
        newUsedDays: 8,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  }

  async reverse(): Promise<any> {
    return {
      success: true,
      statusCode: 200,
      data: {
        hcmTransactionId: 'rev-1',
        newTotalDays: 20,
        newUsedDays: 5,
        lastUpdatedAt: new Date().toISOString(),
      },
    };
  }
}

@Controller('/__control')
class BehaviorController {
  static writer: MockHcmWriter;

  @Post('/behavior')
  setBehavior(@Body() body: { endpoint: string; behavior: string; count: number }) {
    if (body.endpoint === 'deduct' && body.behavior === '500') {
      BehaviorController.writer.setBehavior('500', body.count);
    } else {
      BehaviorController.writer.setBehavior('ok', 0);
    }
    return { ok: true };
  }
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Timed out waiting for condition');
}

describe('outbox worker retry flow', () => {
  jest.setTimeout(40000);

  let app: INestApplication;
  let ds: DataSource;
  let writer: MockHcmWriter;

  beforeEach(async () => {
    process.env.DB_PATH = ':memory:';
    writer = new MockHcmWriter();
    BehaviorController.writer = writer;

    const mod = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [BehaviorController],
    })
      .overrideProvider(HcmDeductionWriter)
      .useValue(writer)
      .compile();

    app = mod.createNestApplication();
    await app.init();
    ds = app.get(DataSource);

    const now = new Date().toISOString();
    await ds.getRepository(Balance).delete({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    await ds.getRepository(Balance).insert({
      id: randomUUID(),
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
    if (app) await app.close();
  });

  it('approves request and updates balance/audit', async () => {
    const idKey = randomUUID();
    const create = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', idKey)
      .send({
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        startDate: '2025-02-10',
        endDate: '2025-02-12',
        daysRequested: 3,
      });
    expect(create.status).toBe(202);

    await waitFor(async () => {
      const row = await ds.getRepository(Outbox).findOneBy({ requestId: create.body.requestId });
      return row?.status === 'DONE';
    }, 4000);

    const req = await request(app.getHttpServer()).get(`/time-off/requests/${create.body.requestId}`);
    expect(req.body.state).toBe('APPROVED');

    const bal = await ds.getRepository(Balance).findOneBy({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal?.usedDays).toBe(8);
    expect(bal?.pendingDays).toBe(0);

    const logs = await ds.getRepository(RequestAuditLog).findBy({ requestId: create.body.requestId });
    const pairs = logs.map((l) => `${l.fromState ?? 'null'}->${l.toState}`);
    expect(pairs).toContain('null->SUBMITTED');
    expect(pairs).toContain('SUBMITTED->PENDING_HCM');
    expect(pairs).toContain('PENDING_HCM->APPROVED');
  });

  it('fails after 3 server errors and restores pending_days', async () => {
    await request(app.getHttpServer())
      .post('/__control/behavior')
      .set('Idempotency-Key', randomUUID())
      .send({ endpoint: 'deduct', behavior: '500', count: 3 });

    const create = await request(app.getHttpServer())
      .post('/time-off/requests')
      .set('X-Employee-Id', 'emp-001')
      .set('Idempotency-Key', randomUUID())
      .send({
        locationId: 'loc-nyc',
        leaveType: 'ANNUAL',
        startDate: '2025-02-10',
        endDate: '2025-02-12',
        daysRequested: 3,
      });
    expect(create.status).toBe(202);

    await waitFor(async () => {
      const outbox = await ds.getRepository(Outbox).findOneBy({ requestId: create.body.requestId });
      return outbox?.status === 'FAILED';
    }, 30000);

    const req = await request(app.getHttpServer()).get(`/time-off/requests/${create.body.requestId}`);
    expect(req.body.state).toBe('FAILED');

    const bal = await ds.getRepository(Balance).findOneBy({
      employeeId: 'emp-001',
      locationId: 'loc-nyc',
      leaveType: LeaveType.ANNUAL,
    });
    expect(bal?.pendingDays).toBe(0);

    const outbox = await ds.getRepository(Outbox).findOneBy({ requestId: create.body.requestId });
    expect(outbox?.status).toBe('FAILED');
    expect(outbox?.attempts).toBe(3);
  });
});

