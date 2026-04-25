import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, finalize, from, map, of, switchMap, throwError } from 'rxjs';

import { IdempotencyRepository } from './idempotency.repository';

function isUuidV4(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private static readonly inFlight = new Map<string, Promise<void>>();

  constructor(private readonly idempotencyRepo: IdempotencyRepository) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<any>();
    const res = http.getResponse<any>();

    if (req?.method !== 'POST') return next.handle();

    const key = req?.headers?.['idempotency-key'];
    if (!key) throw new BadRequestException('Idempotency-Key header is required');
    if (!isUuidV4(key)) throw new BadRequestException('Idempotency-Key must be UUID v4');

    const requestBody = stableJson(req.body);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const createdAt = now.toISOString();

    const replayIfComplete = async (): Promise<boolean> => {
      const record = await this.idempotencyRepo.findByKey(key);
      if (record?.status !== 'COMPLETE') return false;
      if (record.requestBody !== requestBody) {
        throw new ConflictException({
          error: 'IDEMPOTENCY_CONFLICT',
          message: 'This idempotency key was already used with different parameters.',
        });
      }
      res.status(record.responseStatus).json(JSON.parse(record.responseBody ?? 'null'));
      return true;
    };

    const existingFlight = IdempotencyInterceptor.inFlight.get(key);
    if (existingFlight) {
      return from(existingFlight).pipe(
        switchMap(() => from(replayIfComplete())),
        switchMap((handled) => (handled ? of(null) : next.handle())),
      );
    }

    const deferred = (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((resFn) => {
        resolve = resFn;
      });
      return { promise, resolve };
    })();
    IdempotencyInterceptor.inFlight.set(key, deferred.promise);

    return from(this.idempotencyRepo.findByKey(key)).pipe(
      switchMap(async (existing) => {
        if (existing?.status === 'COMPLETE') {
          if (existing.requestBody !== requestBody) {
            throw new ConflictException({
              error: 'IDEMPOTENCY_CONFLICT',
              message: 'This idempotency key was already used with different parameters.',
            });
          }
          res.status(existing.responseStatus).json(JSON.parse(existing.responseBody ?? 'null'));
          return { handled: true as const };
        }

        if (existing?.status === 'IN_PROGRESS') {
          const ageSeconds = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
          if (ageSeconds >= 60) await this.idempotencyRepo.delete(key);
        }

        await this.idempotencyRepo.insertInProgress(key, requestBody, expiresAt, createdAt);
        req['idempotencyKey'] = key;
        req['idempotencyExpiresAt'] = expiresAt;
        return { handled: false as const };
      }),
      switchMap((pre) => {
        if (pre.handled) return of(null);
        return next.handle().pipe(
          switchMap((responseBody) =>
            from(
              this.idempotencyRepo.markComplete(
                key,
                http.getResponse<any>().statusCode,
                JSON.stringify(responseBody),
              ),
            ).pipe(map(() => responseBody)),
          ),
          catchError((err) =>
            from(this.idempotencyRepo.delete(key).catch(() => undefined)).pipe(
              switchMap(() => throwError(() => err)),
            ),
          ),
        );
      }),
      finalize(() => {
        IdempotencyInterceptor.inFlight.delete(key);
        deferred.resolve();
      }),
    );
  }
}

