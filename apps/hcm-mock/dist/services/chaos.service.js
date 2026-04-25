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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChaosService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("typeorm");
const hcm_chaos_config_entity_1 = require("../entities/hcm-chaos-config.entity");
let ChaosService = class ChaosService {
    dataSource;
    constructor(dataSource) {
        this.dataSource = dataSource;
    }
    async loadConfig() {
        const row = await this.dataSource.getRepository(hcm_chaos_config_entity_1.HcmChaosConfig).findOneBy({ id: 'singleton' });
        if (!row)
            return {};
        try {
            const parsed = JSON.parse(row.config);
            return parsed && typeof parsed === 'object' ? parsed : {};
        }
        catch {
            return {};
        }
    }
    async shouldApplyChaos(endpoint) {
        const config = await this.loadConfig();
        const rule = config[endpoint];
        if (!rule)
            return null;
        if (rule.remaining_count === 0) {
            delete config[endpoint];
            await this.saveConfig(config);
            return null;
        }
        if (rule.remaining_count > 0) {
            rule.remaining_count -= 1;
            if (rule.remaining_count === 0)
                delete config[endpoint];
            else
                config[endpoint] = rule;
            await this.saveConfig(config);
        }
        return rule;
    }
    async applyDelay(rule) {
        if (!rule?.delay_ms || rule.delay_ms <= 0)
            return;
        await this.sleep(rule.delay_ms);
    }
    async injectBehavior(rule, response) {
        if (!rule)
            return undefined;
        if (rule.behavior === 'slow') {
            const ms = this.randomInt(3000, 6000);
            await this.sleep(ms);
            return undefined;
        }
        if (rule.behavior === '500') {
            return {
                status: 500,
                body: { error: 'INTERNAL_SERVER_ERROR', message: 'Mock HCM forced 500 response' },
            };
        }
        if (rule.behavior === '409') {
            return {
                status: 409,
                body: {
                    error: 'DUPLICATE_EXTERNAL_REF',
                    externalRef: response.externalRef ?? null,
                    message: 'This externalRef has already been processed',
                    existingTransaction: response.existingTransaction ?? null,
                },
            };
        }
        return undefined;
    }
    async applyBaseLatency() {
        await this.sleep(this.randomInt(50, 200));
    }
    async forceTimeoutClose(waitMs = 10000) {
        await this.sleep(waitMs);
    }
    async setRule(endpoint, rule) {
        const config = await this.loadConfig();
        config[endpoint] = rule;
        await this.saveConfig(config);
    }
    async resetAll() {
        await this.saveConfig({});
    }
    async saveConfig(config) {
        await this.dataSource.getRepository(hcm_chaos_config_entity_1.HcmChaosConfig).upsert({
            id: 'singleton',
            config: JSON.stringify(config),
        }, ['id']);
    }
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    async sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.ChaosService = ChaosService;
exports.ChaosService = ChaosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeorm_1.DataSource])
], ChaosService);
//# sourceMappingURL=chaos.service.js.map