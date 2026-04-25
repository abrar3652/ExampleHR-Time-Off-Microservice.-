import { BadRequestException, Controller, Get, Query } from '@nestjs/common';

import { HcmBatchService, type HcmBatchRecord } from '../services/hcm-batch.service';

@Controller('/api/hcm/batch')
export class HcmBatchController {
  constructor(private readonly batchService: HcmBatchService) {}

  @Get('/balances')
  async getBalances(
    @Query('since') since?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<{
    batchId: string;
    generatedAt: string;
    records: HcmBatchRecord[];
    hasMore: boolean;
    nextCursor: string | null;
    totalCount: number;
  }> {
    const parsedLimit = Number(limitRaw ?? 100);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(500, parsedLimit)) : 100;

    if (!cursor) {
      const snapshot = await this.batchService.createSnapshot(since);
      const page = await this.batchService.getPage(snapshot.batchId, -1, limit);
      const hasMore = page.records.length < snapshot.totalCount;
      return {
        batchId: snapshot.batchId,
        generatedAt: snapshot.generatedAt,
        records: page.records,
        hasMore,
        nextCursor: hasMore && page.nextLastIndex !== null
          ? this.batchService.encodeCursor({ batchId: snapshot.batchId, lastIndex: page.nextLastIndex })
          : null,
        totalCount: snapshot.totalCount,
      };
    }

    const decoded = this.batchService.decodeCursor(cursor);
    if (!decoded) throw new BadRequestException({ error: 'INVALID_CURSOR', message: 'Cursor is invalid' });

    const page = await this.batchService.getPage(decoded.batchId, decoded.lastIndex, limit);
    const consumed = decoded.lastIndex + 1 + page.records.length;
    const hasMore = consumed < page.totalCount;

    return {
      batchId: decoded.batchId,
      generatedAt: page.generatedAt,
      records: page.records,
      hasMore,
      nextCursor:
        hasMore && page.nextLastIndex !== null
          ? this.batchService.encodeCursor({ batchId: decoded.batchId, lastIndex: page.nextLastIndex })
          : null,
      totalCount: page.totalCount,
    };
  }
}
