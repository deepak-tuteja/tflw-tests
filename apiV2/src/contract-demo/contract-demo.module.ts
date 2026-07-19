import { Module } from '@nestjs/common';
import { ContractDemoController } from './contract-demo.controller';

@Module({
  controllers: [ContractDemoController],
})
export class ContractDemoModule {}
