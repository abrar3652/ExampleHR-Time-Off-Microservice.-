import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { HcmChaosConfig } from '../entities/hcm-chaos-config.entity';

export type ChaosBehavior =
  | 'timeout'
  | '500'
  | '409'
  | 'slow'
  | 'silent_success'
  | 'invalid_validation'
  | 'enable'
  | 'stale_timestamps';

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

@Injectable()
export class ChaosService {
  constructor(private readonly dataSource: DataSource) {}

  async loadConfig(): Promise<ChaosConfigMap> {
    const row = await this.dataSource.getRepository(HcmChaosConfig).findOneBy({ id: 'singleton' });
    if (!row) return {};
    try {
      const parsed = JSON.parse(row.config) as ChaosConfigMap;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async shouldApplyChaos(endpoint: string): Promise<ChaosRule | null> {
    const config = await this.loadConfig();
    const rule = config[endpoint];
    if (!rule) return null;

    if (rule.remaining_count === 0) {
      delete config[endpoint];
      await this.saveConfig(config);
      return null;
    }

    if (rule.remaining_count > 0) {
      rule.remaining_count -= 1;
      if (rule.remaining_count === 0) delete config[endpoint];
      else config[endpoint] = rule;
      await this.saveConfig(config);
    }

    return rule;
  }

  async applyDelay(rule: ChaosRule | null): Promise<void> {
    if (!rule?.delay_ms || rule.delay_ms <= 0) return;
    await this.sleep(rule.delay_ms);
  }

  async injectBehavior(
    rule: ChaosRule | null,
    response: { endpoint: string; externalRef?: string; existingTransaction?: string },
  ): Promise<ChaosInjectedResponse | undefined> {
    if (!rule) return undefined;

    if (rule.behavior === 'slow') {
      const ms = this.randomInt(3000, 6000);
      await this.sleep(ms);
      return undefined;
    }

    if (rule.behavior === '500') {
      return {
        status: 500,
        body: { error: 'INTERNAL_SERVER_ERROR', message: 'Mock HCM forced 500 response' },
      };
    }

    if (rule.behavior === '409') {
      return {
        status: 409,
        body: {
          error: 'DUPLICATE_EXTERNAL_REF',
          externalRef: response.externalRef ?? null,
          message: 'This externalRef has already been processed',
          existingTransaction: response.existingTransaction ?? null,
        },
      };
    }

    return undefined;
  }

  async applyBaseLatency(): Promise<void> {
    await this.sleep(this.randomInt(50, 200));
  }

  async forceTimeoutClose(waitMs = 10000): Promise<void> {
    await this.sleep(waitMs);
  }

  async setRule(endpoint: string, rule: ChaosRule): Promise<void> {
    const config = await this.loadConfig();
    config[endpoint] = rule;
    await this.saveConfig(config);
  }

  async resetAll(): Promise<void> {
    await this.saveConfig({});
  }

  private async saveConfig(config: ChaosConfigMap): Promise<void> {
    await this.dataSource.getRepository(HcmChaosConfig).upsert(
      {
        id: 'singleton',
        config: JSON.stringify(config),
      },
      ['id'],
    );
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
