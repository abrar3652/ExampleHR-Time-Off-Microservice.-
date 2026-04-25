import { DataSource } from 'typeorm';
import { HcmClockService } from './hcm-clock.service';
export declare class HcmCallLogService {
    private readonly dataSource;
    private readonly clock;
    constructor(dataSource: DataSource, clock: HcmClockService);
    append(input: {
        endpoint: string;
        method: string;
        requestBody?: unknown;
        responseStatus: number;
        responseBody?: unknown;
        chaosApplied?: string | null;
        durationMs: number;
    }): Promise<void>;
}
