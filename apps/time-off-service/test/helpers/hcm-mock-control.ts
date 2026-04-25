export class HcmMockControl {
  constructor(private readonly baseUrl: string) {}

  async setBalance(
    employeeId: string,
    locationId: string,
    leaveType: string,
    balance: { totalDays: number; usedDays: number; hcmLastUpdatedAt: string },
  ): Promise<void> {
    await this.post('/__control/balance', {
      employeeId,
      locationId,
      leaveType,
      totalDays: balance.totalDays,
      usedDays: balance.usedDays,
      hcmLastUpdatedAt: balance.hcmLastUpdatedAt,
    });
  }

  async setNextCallBehavior(
    endpoint: string,
    behavior: 'timeout' | '500' | '409' | 'slow' | 'silent_success' | 'invalid_validation',
    count: number,
  ): Promise<void> {
    await this.post('/__control/behavior', {
      endpoint,
      behavior,
      count,
    });
  }

  async reset(): Promise<void> {
    await this.post('/__control/reset', {});
  }

  async getCallLog(): Promise<
    Array<{ endpoint: string; method: string; responseStatus: number; chaosApplied: string | null; calledAt: string }>
  > {
    const response = await fetch(`${this.baseUrl}/__control/call-log`);
    if (!response.ok) throw new Error(`HCM call-log failed: ${response.status}`);
    return (await response.json()) as Array<{
      endpoint: string;
      method: string;
      responseStatus: number;
      chaosApplied: string | null;
      calledAt: string;
    }>;
  }

  async advanceClock(ms: number): Promise<void> {
    await this.post('/__control/advance-clock', { milliseconds: ms });
  }

  private async post(path: string, body: unknown): Promise<void> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HCM control ${path} failed: ${response.status}`);
  }
}
