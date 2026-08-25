import { Module } from '@nestjs/common';
import { SoftCheckController } from './soft-check.controller';

// Unconditionally mounted (`D725`). A deliberate known answer is not a vulnerability: `vuln/` earns
// its `VULN_MODE=1` gate because it serves live flaws, and this serves a constant.
@Module({
  controllers: [SoftCheckController],
})
export class SoftCheckModule {}
