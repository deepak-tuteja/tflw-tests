import { Controller, Get } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

// `S-3d` data (decision 18): one document where `null` and absence sit side by side — a field that
// is present and null, a nested one, a null inside a list, and a field that is simply not there — so
// a journey can say which is which and a matcher that confuses them is caught.
@ApiExcludeController()
@Controller('edge/nulls')
export class NullsController {
  @Get()
  nulls(): Record<string, unknown> {
    return {
      presentButNull: null,
      nested: { value: null, label: 'nested' },
      list: [1, null, 3],
      emptyString: '',
      zero: 0,
      falseValue: false,
    };
  }
}
