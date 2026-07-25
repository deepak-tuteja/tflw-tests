import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReturnRequestsService } from './return-requests.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

// `POST /orders/:id/return-request` — a separate controller sharing the `orders` prefix, same
// pattern as review-thread.controller.ts sharing `reviews` with reviews.controller.ts, rather
// than folding this into OrdersController (a different entity/repository entirely).
@ApiTags('orders')
@Controller('orders')
export class OrderReturnRequestController {
  constructor(private readonly returnRequests: ReturnRequestsService) {}

  @Post(':id/return-request')
  @UseGuards(AnyAuthGuard)
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: CreateReturnRequestDto,
  ) {
    return this.returnRequests.submit(id, user.id, dto);
  }
}
