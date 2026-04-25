"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const global_exception_filter_1 = require("./filters/global-exception.filter");
const balance_module_1 = require("./modules/balance/balance.module");
const idempotency_interceptor_1 = require("./modules/idempotency/idempotency.interceptor");
const idempotency_module_1 = require("./modules/idempotency/idempotency.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            typeorm_1.TypeOrmModule.forRoot({
                type: 'better-sqlite3',
                database: process.env.DB_PATH ?? './data/time_off.sqlite',
                enableWAL: true,
                prepareDatabase: (db) => {
                    db.pragma('busy_timeout = 5000');
                },
                autoLoadEntities: true,
                synchronize: true,
            }),
            balance_module_1.BalanceModule,
            idempotency_module_1.IdempotencyModule,
        ],
        providers: [
            { provide: core_1.APP_FILTER, useClass: global_exception_filter_1.GlobalExceptionFilter },
            { provide: core_1.APP_INTERCEPTOR, useClass: idempotency_interceptor_1.IdempotencyInterceptor },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map