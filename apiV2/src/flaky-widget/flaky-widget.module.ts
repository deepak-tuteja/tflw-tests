import { Module } from '@nestjs/common';
import { FlakyWidgetController } from './flaky-widget.controller';
import { FlakyWidgetService } from './flaky-widget.service';

@Module({
  controllers: [FlakyWidgetController],
  providers: [FlakyWidgetService],
})
export class FlakyWidgetModule {}
