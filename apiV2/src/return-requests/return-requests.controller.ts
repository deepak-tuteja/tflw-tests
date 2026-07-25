import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ReturnRequestsService } from './return-requests.service';
import { DecideReturnRequestDto } from './dto/decide-return-request.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';

@ApiTags('return-requests')
@Controller('return-requests')
@UseGuards(AnyAuthGuard, RolesGuard)
export class ReturnRequestsController {
  constructor(private readonly returnRequests: ReturnRequestsService) {}

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.returnRequests.findOneScoped(id, user);
  }

  // Admin-only (decision 4 — no new role): the owner submits, admin decides.
  @Patch(':id')
  @Roles(UserRole.ADMIN)
  decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideReturnRequestDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.returnRequests.decide(id, dto, user.id);
  }
}
