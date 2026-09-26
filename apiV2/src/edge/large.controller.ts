import { Controller, Get, Query } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

// `S-3d` data (decision 18): a body as large as asked for, up to 4 MiB, of a known shape — a long
// string between two markers — so a journey can assert on a 2 MiB document and a failing assertion
// on one shows whether tflw's failure message stays readable (capped) rather than printing it all.
@ApiExcludeController()
@Controller('edge/large')
export class LargeController {
  @Get()
  large(@Query('kib') kib: string | undefined): {
    bytes: number;
    blob: string;
  } {
    const size =
      Math.min(Math.max(Number(kib ?? 2048) || 2048, 1), 4096) * 1024;
    const filler = 'x'.repeat(Math.max(size - 20, 0));
    return { bytes: size, blob: `start-marker${filler}end-mark` };
  }
}
