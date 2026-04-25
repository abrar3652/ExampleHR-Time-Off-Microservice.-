import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { LeaveType } from '../../domain/enums';
import { Balance } from './entities/balance.entity';

@Injectable()
export class BalanceRepository {
  constructor(private readonly dataSource: DataSource) {}

  findByDimensions(employeeId: string, locationId: string, leaveType: LeaveType): Promise<Balance | null> {
    return this.dataSource.getRepository(Balance).findOne({ where: { employeeId, locationId, leaveType } });
  }

  async upsert(data: Balance): Promise<Balance> {
    await this.dataSource.getRepository(Balance).save(data);
    return data;
  }

  lockRow(
    manager: EntityManager,
    employeeId: string,
    locationId: string,
    leaveType: LeaveType,
  ): Promise<Balance | null> {
    return manager.getRepository(Balance).findOne({ where: { employeeId, locationId, leaveType } });
  }
}

