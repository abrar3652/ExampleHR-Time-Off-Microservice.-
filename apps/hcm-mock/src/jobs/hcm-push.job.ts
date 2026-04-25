import { Injectable } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';

import { ChaosService } from '../services/chaos.service';
import { HcmBatchService } from '../services/hcm-batch.service';
import { HcmCallLogService } from '../services/hcm-call-log.service';

@Injectable()
export class HcmPushJob {
  private lastRunAt = 0;

  constructor(
    private readonly chaos: ChaosService,
    private readonly batchService: HcmBatchService,
    private readonly callLog: HcmCallLogService,
  ) {}

  @Interval(1000)
  async run(): Promise<void> {
    const config = await this.chaos.loadConfig();
    const configured = config.batch_push;
    if (!configured) return;
    if (configured.behavior !== 'enable' && configured.behavior !== 'stale_timestamps') return;

    const intervalSeconds = configured.interval_seconds ?? 60;
    const nowMs = Date.now();
    if (nowMs - this.lastRunAt < intervalSeconds * 1000) return;
    this.lastRunAt = nowMs;

    const rule = await this.chaos.shouldApplyChaos('batch_push');
    if (!rule) return;
    if (rule.behavior !== 'enable' && rule.behavior !== 'stale_timestamps') return;

    const snapshot = await this.batchService.createSnapshot();
    const page = await this.batchService.getPage(snapshot.batchId, -1, Number.MAX_SAFE_INTEGER);
    const staleMode = rule.behavior === 'stale_timestamps';
    const records = staleMode
      ? page.records.map((r) => ({
          ...r,
          hcmLastUpdatedAt: new Date(Date.parse(r.hcmLastUpdatedAt) - 2 * 60 * 60 * 1000).toISOString(),
        }))
      : page.records;

    const payload = {
      batchId: snapshot.batchId,
      generatedAt: snapshot.generatedAt,
      records,
    };

    const started = Date.now();
    let status = 500;
    let responseBody: unknown = null;
    try {
      const response = await fetch('http://localhost:3000/sync/batch/balances', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      status = response.status;
      const text = await response.text();
      if (text.length === 0) {
        responseBody = null;
      } else {
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = { raw: text };
        }
      }
    } catch (err) {
      responseBody = { error: 'PUSH_FAILED', message: err instanceof Error ? err.message : 'Unknown error' };
    }

    await this.callLog.append({
      endpoint: 'batch_push',
      method: 'POST',
      requestBody: payload,
      responseStatus: status,
      responseBody,
      chaosApplied: rule.behavior,
      durationMs: Date.now() - started,
    });
  }
}
