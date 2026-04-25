import { Body, Controller, Headers, HttpCode, Post } from '@nestjs/common';

import { TimeOffService, type CreateTimeOffRequestDto } from './time-off.service';

@Controller('/time-off')
export class TimeOffController {
  constructor(private readonly timeOffService: TimeOffService) {}

  @Post('/requests')
  @HttpCode(202)
  createRequest(
    @Body() dto: CreateTimeOffRequestDto,
    @Headers('x-employee-id') employeeId: string,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    return this.timeOffService.createRequest(dto, employeeId, idempotencyKey);
  }
}

