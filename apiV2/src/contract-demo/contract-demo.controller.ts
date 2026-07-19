import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { DriftedWidgetResponseDto } from './dto/drifted-widget-response.dto';

// Unauthenticated, static — the point of this endpoint is purely the documented-vs-actual schema
// drift (PLAN decision 102a), not any real behavior worth guarding.
@ApiTags('contract-demo')
@Controller('contract-demo')
export class ContractDemoController {
  @Get('drifted')
  @ApiOkResponse({ type: DriftedWidgetResponseDto })
  drifted() {
    // Real response deliberately omits `price`, which the schema above documents as required —
    // the drift `tests/.demo-fail/contract-drift.tflw` proves tflw's contract matcher catches.
    return { id: 'w1', name: 'Drifted Widget' };
  }
}
