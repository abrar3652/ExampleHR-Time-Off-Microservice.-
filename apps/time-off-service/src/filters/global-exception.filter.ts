import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

import { DomainException } from '../domain/exceptions';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<any>();
    const req = ctx.getRequest<any>();

    if (exception instanceof DomainException) {
      res.status(exception.statusCode).json({
        error: exception.code,
        message: exception.message,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if ((exception as any)?.code === 'SQLITE_BUSY') {
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
}

