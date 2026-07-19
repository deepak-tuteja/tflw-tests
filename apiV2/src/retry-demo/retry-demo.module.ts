import { Module } from '@nestjs/common';
import { RetryDemoController } from './retry-demo.controller';
import { RetryDemoService } from './retry-demo.service';

@Module({
  controllers: [RetryDemoController],
  providers: [RetryDemoService],
})
export class RetryDemoModule {}
