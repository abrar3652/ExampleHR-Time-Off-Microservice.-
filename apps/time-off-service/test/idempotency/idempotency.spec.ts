import { Body, Controller, HttpCode, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';

import { IdempotencyModule } from '../../src/modules/idempotency/idempotency.module';
import { IdempotencyInterceptor } from '../../src/modules/idempotency/idempotency.interceptor';
import { IdempotencyRecord } from '../../src/modules/idempotency/entities/idempotency-record.entity';
import { IdempotencyRepository } from '../../src/modules/idempotency/idempotency.repository';

@Controller()
class TestController {
  static calls = 0;

  @Post('/__test/echo')
  @HttpCode(200)
  echo(@Body() body: any): any {
    TestController.calls += 1;
    return { ok: true, body };
  }
}

describe('IdempotencyInterceptor', () => {
  let app: INestApplication;
  let repo: IdempotencyRepository;

  beforeEach(async () => {
    TestController.calls = 0;

    const mod = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          enableWAL: true,
          autoLoadEntities: true,
          synchronize: true,
        }),
        TypeOrmModule.forFeature([IdempotencyRecord]),
        IdempotencyModule,
      ],
      controllers: [TestController],
    }).compile();

    app = mod.createNestApplication();
    app.useGlobalInterceptors(mod.get(IdempotencyInterceptor));
    await app.init();

    repo = app.get(IdempotencyRepository);
  });

  afterEach(async () => {
    await app.close();
  });

  it('Same key, same body -> second call returns stored response, single DB record', async () => {
    const key = '11111111-1111-4111-8111-111111111111';
    const body = { a: 1 };

    const r1 = await request(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send(body);
    const r2 = await request(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send(body);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r2.body).toEqual(r1.body);
    expect(TestController.calls).toBe(1);

    const record = await repo.findByKey(key);
    expect(record?.status).toBe('COMPLETE');
  });

  it('Same key, different body -> 409 IDEMPOTENCY_CONFLICT', async () => {
    const key = '22222222-2222-4222-8222-222222222222';

    await request(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send({ a: 1 });
    const r2 = await request(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send({ a: 2 });

    expect(r2.status).toBe(409);
    expect(r2.body.error).toBe('IDEMPOTENCY_CONFLICT');
    expect(r2.body.message).toBe('This idempotency key was already used with different parameters.');
  });

  it('10 concurrent calls with same key -> exactly 1 DB record created', async () => {
    const key = '33333333-3333-4333-8333-333333333333';
    const body = { a: 1 };

    const reqs = Array.from({ length: 10 }, () =>
      request(app.getHttpServer()).post('/__test/echo').set('Idempotency-Key', key).send(body),
    );
    const results = await Promise.all(reqs);

    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(TestController.calls).toBe(1);
    const record = await repo.findByKey(key);
    expect(record?.status).toBe('COMPLETE');
  });
});

