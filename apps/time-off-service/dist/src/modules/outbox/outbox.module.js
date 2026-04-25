"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OutboxModule = void 0;
const common_1 = require("@nestjs/common");
const hcm_client_module_1 = require("../hcm-client/hcm-client.module");
const outbox_processor_1 = require("./outbox.processor");
const outbox_repository_1 = require("./outbox.repository");
const outbox_worker_1 = require("./outbox.worker");
let OutboxModule = class OutboxModule {
};
exports.OutboxModule = OutboxModule;
exports.OutboxModule = OutboxModule = __decorate([
    (0, common_1.Module)({
        imports: [hcm_client_module_1.HcmClientModule],
        providers: [outbox_repository_1.OutboxRepository, outbox_processor_1.OutboxProcessor, outbox_worker_1.OutboxWorker],
        exports: [outbox_repository_1.OutboxRepository, outbox_processor_1.OutboxProcessor, outbox_worker_1.OutboxWorker],
    })
], OutboxModule);
//# sourceMappingURL=outbox.module.js.map