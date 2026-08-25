import { Module } from '@nestjs/common';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';

// Unconditionally mounted (`D725`) — in-memory counters, no persistence, no flaw.
@Module({
  controllers: [LifecycleController],
  providers: [LifecycleService],
})
export class LifecycleModule {}
