"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var GlobalExceptionFilter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const exceptions_1 = require("../domain/exceptions");
let GlobalExceptionFilter = GlobalExceptionFilter_1 = class GlobalExceptionFilter {
    logger = new common_1.Logger(GlobalExceptionFilter_1.name);
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const res = ctx.getResponse();
        const req = ctx.getRequest();
        if (exception instanceof exceptions_1.DomainException) {
            res.status(exception.statusCode).json({
                error: exception.code,
                message: exception.message,
                timestamp: new Date().toISOString(),
            });
            return;
        }
        if (exception?.code === 'SQLITE_BUSY') {
            res.status(503).json({
                error: 'DATABASE_BUSY',
                message: 'System is under load. Please retry in a moment.',
                timestamp: new Date().toISOString(),
            });
            return;
        }
        this.logger.error({ exception, path: req.url }, 'Unhandled exception');
        res.status(500).json({
            error: 'INTERNAL_ERROR',
            message: 'An unexpected error occurred',
            timestamp: new Date().toISOString(),
        });
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = GlobalExceptionFilter_1 = __decorate([
    (0, common_1.Catch)()
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map