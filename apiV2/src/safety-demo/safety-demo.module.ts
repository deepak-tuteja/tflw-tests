import { Module } from '@nestjs/common';
import { SafetyDemoController } from './safety-demo.controller';
import { CookieScopeController } from './cookie-scope.controller';

@Module({
  controllers: [SafetyDemoController, CookieScopeController],
})
export class SafetyDemoModule {}
