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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HcmClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let HcmClient = class HcmClient {
    config;
    http;
    constructor(config) {
        this.config = config;
        const baseURL = this.config.get('HCM_BASE_URL') ?? 'http://localhost:4000';
        this.http = axios_1.default.create({ baseURL });
    }
    get axios() {
        return this.http;
    }
    async callHcm(fn, context) {
        let timeoutHandle = null;
        try {
            const response = await Promise.race([
                fn(),
                new Promise((_, reject) => {
                    timeoutHandle = setTimeout(() => reject(new Error('HCM_TIMEOUT')), 8000);
                }),
            ]);
            return { success: true, data: response.data, statusCode: response.status };
        }
        catch (err) {
            if (err.message === 'HCM_TIMEOUT') {
                return { success: false, reason: 'TIMEOUT' };
            }
            if (err.response) {
                const { status, data } = err.response;
                return {
                    success: false,
                    reason: status >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR',
                    statusCode: status,
                    body: data,
                };
            }
            void context;
            return { success: false, reason: 'NETWORK_ERROR' };
        }
        finally {
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
        }
    }
};
exports.HcmClient = HcmClient;
exports.HcmClient = HcmClient = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], HcmClient);
//# sourceMappingURL=hcm-client.service.js.map