import { DataSource } from 'typeorm';
import { ChaosBehavior, ChaosService } from '../services/chaos.service';
import { HcmClockService } from '../services/hcm-clock.service';
interface BehaviorBody {
    endpoint: string;
    behavior: ChaosBehavior;
    count: number;
    delayMs?: number;
    intervalSeconds?: number;
}
interface BalanceBody {
    employeeId: string;
    locationId: string;
    leaveType: string;
    totalDays: number;
    usedDays: number;
    hcmLastUpdatedAt: string;
}
interface DriftBody {
    employeeId: string;
    locationId: string;
    leaveType: string;
    newTotalDays: number;
    reason: string;
}
interface AdvanceClockBody {
    milliseconds: number;
}
export declare class ControlController {
    private readonly dataSource;
    private readonly chaos;
    private readonly clock;
    constructor(dataSource: DataSource, chaos: ChaosService, clock: HcmClockService);
    setBehavior(body: BehaviorBody): Promise<{
        ok: true;
        config: unknown;
    }>;
    setBalance(body: BalanceBody): Promise<{
        ok: true;
    }>;
    drift(body: DriftBody): Promise<{
        ok: true;
        lastUpdatedAt: string;
    }>;
    advanceClock(body: AdvanceClockBody): Promise<{
        ok: true;
        offsetMs: number;
    }>;
    getCallLog(): Promise<Array<{
        endpoint: string;
        method: string;
        responseStatus: number;
        chaosApplied: string | null;
        calledAt: string;
    }>>;
    reset(): Promise<{
        ok: true;
    }>;
}
export {};
