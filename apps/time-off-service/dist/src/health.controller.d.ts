import { DataSource } from 'typeorm';
export declare class HealthController {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    getHealth(): Promise<{
        outboxPendingCount: number;
    }>;
}
