import { DataSource, EntityManager } from 'typeorm';
import { LeaveType } from '../../domain/enums';
import { Balance } from './entities/balance.entity';
export declare class BalanceRepository {
    private readonly dataSource;
    constructor(dataSource: DataSource);
    findByDimensions(employeeId: string, locationId: string, leaveType: LeaveType): Promise<Balance | null>;
    upsert(data: Balance): Promise<Balance>;
    lockRow(manager: EntityManager, employeeId: string, locationId: string, leaveType: LeaveType): Promise<Balance | null>;
}
