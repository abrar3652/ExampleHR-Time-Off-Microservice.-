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
var BalanceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const typeorm_1 = require("typeorm");
const enums_1 = require("../../domain/enums");
const exceptions_1 = require("../../domain/exceptions");
const hcm_balance_fetcher_service_1 = require("../hcm-client/hcm-balance-fetcher.service");
const balance_change_log_entity_1 = require("./entities/balance-change-log.entity");
const balance_entity_1 = require("./entities/balance.entity");
const balance_repository_1 = require("./balance.repository");
const TTL_MS = 5 * 60 * 1000;
let BalanceService = BalanceService_1 = class BalanceService {
    dataSource;
    repo;
    hcmBalanceFetcher;
    logger = new common_1.Logger(BalanceService_1.name);
    constructor(dataSource, repo, hcmBalanceFetcher) {
        this.dataSource = dataSource;
        this.repo = repo;
        this.hcmBalanceFetcher = hcmBalanceFetcher;
    }
    async getOrFetchBalance(employeeId, locationId, leaveType) {
        const existing = await this.repo.findByDimensions(employeeId, locationId, leaveType);
        if (existing && this.isFresh(existing.syncedAt))
            return existing;
        const hcmResult = await this.hcmBalanceFetcher.getBalance(employeeId, locationId, leaveType);
        if (!hcmResult.success) {
            const fallback = existing ?? (await this.repo.findByDimensions(employeeId, locationId, leaveType));
            if (fallback && this.isFresh(fallback.syncedAt)) {
                this.logger.warn({ employeeId, locationId, leaveType, reason: hcmResult.reason }, 'HCM fetch failed; returning fresh cached balance');
                return fallback;
            }
            throw new exceptions_1.HcmUnavailableException('Balance data is stale and HCM is unreachable. Please retry later.');
        }
        if (hcmResult.statusCode === 404) {
            throw new exceptions_1.BalanceNotFoundError(`No balance found for employee ${employeeId} at location ${locationId} for leave type ${leaveType}`);
        }
        const now = new Date().toISOString();
        return this.withImmediateTransaction(async (manager) => {
            const current = await manager
                .getRepository(balance_entity_1.Balance)
                .findOne({ where: { employeeId, locationId, leaveType } });
            const next = current
                ? {
                    ...current,
                    totalDays: hcmResult.data.totalDays,
                    usedDays: hcmResult.data.usedDays,
                    hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
                    syncedAt: now,
                    updatedAt: now,
                }
                : {
                    id: (0, node_crypto_1.randomUUID)(),
                    employeeId,
                    locationId,
                    leaveType,
                    totalDays: hcmResult.data.totalDays,
                    usedDays: hcmResult.data.usedDays,
                    pendingDays: 0,
                    hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
                    syncedAt: now,
                    createdAt: now,
                    updatedAt: now,
                };
            if (current) {
                await manager.getRepository(balance_entity_1.Balance).update({ id: current.id }, {
                    totalDays: next.totalDays,
                    usedDays: next.usedDays,
                    hcmLastUpdatedAt: next.hcmLastUpdatedAt,
                    syncedAt: next.syncedAt,
                    updatedAt: next.updatedAt,
                });
            }
            else {
                await manager.getRepository(balance_entity_1.Balance).insert(next);
            }
            await this.writeRealTimeSyncChangeLogs(manager, current, next);
            return next;
        });
    }
    async withBalanceLock(employeeId, locationId, leaveType, fn) {
        return this.withImmediateTransaction(async (manager) => {
            let balance = await manager
                .getRepository(balance_entity_1.Balance)
                .findOne({ where: { employeeId, locationId, leaveType } });
            if (!balance) {
                const hcmResult = await this.hcmBalanceFetcher.getBalance(employeeId, locationId, leaveType);
                if (!hcmResult.success)
                    throw new exceptions_1.HcmUnavailableException();
                if (hcmResult.statusCode === 404) {
                    throw new exceptions_1.BalanceNotFoundError(`No balance found for employee ${employeeId} at location ${locationId} for leave type ${leaveType}`);
                }
                const now = new Date().toISOString();
                balance = manager.create(balance_entity_1.Balance, {
                    id: (0, node_crypto_1.randomUUID)(),
                    employeeId,
                    locationId,
                    leaveType,
                    totalDays: hcmResult.data.totalDays,
                    usedDays: hcmResult.data.usedDays,
                    pendingDays: 0,
                    hcmLastUpdatedAt: hcmResult.data.lastUpdatedAt,
                    syncedAt: now,
                    createdAt: now,
                    updatedAt: now,
                });
                await manager.getRepository(balance_entity_1.Balance).insert(balance);
            }
            return fn(manager, balance);
        });
    }
    isFresh(syncedAt) {
        return Date.now() - new Date(syncedAt).getTime() < TTL_MS;
    }
    async writeRealTimeSyncChangeLogs(manager, before, after) {
        const now = new Date().toISOString();
        const rows = [];
        const pushIfChanged = (fieldChanged, oldValue, newValue) => {
            if (oldValue === newValue)
                return;
            rows.push(manager.create(balance_change_log_entity_1.BalanceChangeLog, {
                id: (0, node_crypto_1.randomUUID)(),
                balanceId: after.id,
                employeeId: after.employeeId,
                locationId: after.locationId,
                leaveType: after.leaveType,
                fieldChanged,
                oldValue,
                newValue,
                delta: newValue - oldValue,
                source: enums_1.BalanceChangeSource.REAL_TIME_SYNC,
                sourceRef: null,
                hcmTimestamp: after.hcmLastUpdatedAt,
                createdAt: now,
            }));
        };
        pushIfChanged('total_days', before?.totalDays ?? 0, after.totalDays);
        pushIfChanged('used_days', before?.usedDays ?? 0, after.usedDays);
        if (rows.length > 0) {
            await manager.getRepository(balance_change_log_entity_1.BalanceChangeLog).insert(rows);
        }
    }
    async withImmediateTransaction(fn) {
        return this.dataSource.transaction((manager) => fn(manager));
    }
};
exports.BalanceService = BalanceService;
exports.BalanceService = BalanceService = BalanceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource,
        balance_repository_1.BalanceRepository,
        hcm_balance_fetcher_service_1.HcmBalanceFetcher])
], BalanceService);
//# sourceMappingURL=balance.service.js.map