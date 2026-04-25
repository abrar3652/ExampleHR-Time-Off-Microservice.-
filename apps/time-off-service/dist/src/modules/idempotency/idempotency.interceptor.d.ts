import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { IdempotencyRepository } from './idempotency.repository';
export declare class IdempotencyInterceptor implements NestInterceptor {
    private readonly idempotencyRepo;
    private static readonly inFlight;
    constructor(idempotencyRepo: IdempotencyRepository);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
