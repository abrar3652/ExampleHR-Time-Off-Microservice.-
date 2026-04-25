import { DataSource } from 'typeorm';
export type ChaosBehavior = 'timeout' | '500' | '409' | 'slow' | 'silent_success' | 'invalid_validation' | 'enable' | 'stale_timestamps';
export interface ChaosRule {
    behavior: ChaosBehavior;
    remaining_count: number;
    delay_ms?: number;
    interval_seconds?: number;
}
export type ChaosConfigMap = Record<string, ChaosRule>;
export interface ChaosInjectedResponse {
    status: number;
    body: Record<string, unknown>;
}
export declare class ChaosService {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    loadConfig(): Promise<ChaosConfigMap>;
    shouldApplyChaos(endpoint: string): Promise<ChaosRule | null>;
    applyDelay(rule: ChaosRule | null): Promise<void>;
    injectBehavior(rule: ChaosRule | null, response: {
        endpoint: string;
        externalRef?: string;
        existingTransaction?: string;
    }): Promise<ChaosInjectedResponse | undefined>;
    applyBaseLatency(): Promise<void>;
    forceTimeoutClose(waitMs?: number): Promise<void>;
    setRule(endpoint: string, rule: ChaosRule): Promise<void>;
    resetAll(): Promise<void>;
    private saveConfig;
    private randomInt;
    private sleep;
}
