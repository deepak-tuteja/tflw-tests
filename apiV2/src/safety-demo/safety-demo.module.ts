import { Module } from '@nestjs/common';
import { SafetyDemoController } from './safety-demo.controller';

@Module({
  controllers: [SafetyDemoController],
})
export class SafetyDemoModule {}
