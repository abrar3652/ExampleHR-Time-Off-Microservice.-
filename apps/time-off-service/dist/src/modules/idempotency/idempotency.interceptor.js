"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var IdempotencyInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyInterceptor = void 0;
const common_1 = require("@nestjs/common");
const rxjs_1 = require("rxjs");
const idempotency_repository_1 = require("./idempotency.repository");
function isUuidV4(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function stableJson(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(',')}]`;
    const obj = value;
    const keys = Object.keys(obj).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}
let IdempotencyInterceptor = class IdempotencyInterceptor {
    static { IdempotencyInterceptor_1 = this; }
    idempotencyRepo;
    static inFlight = new Map();
    constructor(idempotencyRepo) {
        this.idempotencyRepo = idempotencyRepo;
    }
    intercept(context, next) {
        const http = context.switchToHttp();
        const req = http.getRequest();
        const res = http.getResponse();
        if (req?.method !== 'POST')
            return next.handle();
        const key = req?.headers?.['idempotency-key'];
        if (!key)
            throw new common_1.BadRequestException('Idempotency-Key header is required');
        if (!isUuidV4(key))
            throw new common_1.BadRequestException('Idempotency-Key must be UUID v4');
        const requestBody = stableJson(req.body);
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
        const createdAt = now.toISOString();
        const replayIfComplete = async () => {
            const record = await this.idempotencyRepo.findByKey(key);
            if (record?.status !== 'COMPLETE')
                return false;
            if (record.requestBody !== requestBody) {
                throw new common_1.ConflictException({
                    error: 'IDEMPOTENCY_CONFLICT',
                    message: 'This idempotency key was already used with different parameters.',
                });
            }
            res.status(record.responseStatus).json(JSON.parse(record.responseBody ?? 'null'));
            return true;
        };
        const existingFlight = IdempotencyInterceptor_1.inFlight.get(key);
        if (existingFlight) {
            return (0, rxjs_1.from)(existingFlight).pipe((0, rxjs_1.switchMap)(() => (0, rxjs_1.from)(replayIfComplete())), (0, rxjs_1.switchMap)((handled) => (handled ? (0, rxjs_1.of)(null) : next.handle())));
        }
        const deferred = (() => {
            let resolve;
            const promise = new Promise((resFn) => {
                resolve = resFn;
            });
            return { promise, resolve };
        })();
        IdempotencyInterceptor_1.inFlight.set(key, deferred.promise);
        return (0, rxjs_1.from)(this.idempotencyRepo.findByKey(key)).pipe((0, rxjs_1.switchMap)(async (existing) => {
            if (existing?.status === 'COMPLETE') {
                if (existing.requestBody !== requestBody) {
                    throw new common_1.ConflictException({
                        error: 'IDEMPOTENCY_CONFLICT',
                        message: 'This idempotency key was already used with different parameters.',
                    });
                }
                res.status(existing.responseStatus).json(JSON.parse(existing.responseBody ?? 'null'));
                return { handled: true };
            }
            if (existing?.status === 'IN_PROGRESS') {
                const ageSeconds = (Date.now() - new Date(existing.createdAt).getTime()) / 1000;
                if (ageSeconds >= 60)
                    await this.idempotencyRepo.delete(key);
            }
            await this.idempotencyRepo.insertInProgress(key, requestBody, expiresAt, createdAt);
            req['idempotencyKey'] = key;
            req['idempotencyExpiresAt'] = expiresAt;
            return { handled: false };
        }), (0, rxjs_1.switchMap)((pre) => {
            if (pre.handled)
                return (0, rxjs_1.of)(null);
            return next.handle().pipe((0, rxjs_1.tap)(async (responseBody) => {
                const statusCode = http.getResponse().statusCode;
                await this.idempotencyRepo.markComplete(key, statusCode, JSON.stringify(responseBody));
            }), (0, rxjs_1.catchError)((err) => (0, rxjs_1.from)(this.idempotencyRepo.delete(key).catch(() => undefined)).pipe((0, rxjs_1.switchMap)(() => (0, rxjs_1.throwError)(() => err)))));
        }), (0, rxjs_1.finalize)(() => {
            IdempotencyInterceptor_1.inFlight.delete(key);
            deferred.resolve();
        }));
    }
};
exports.IdempotencyInterceptor = IdempotencyInterceptor;
exports.IdempotencyInterceptor = IdempotencyInterceptor = IdempotencyInterceptor_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [idempotency_repository_1.IdempotencyRepository])
], IdempotencyInterceptor);
//# sourceMappingURL=idempotency.interceptor.js.map