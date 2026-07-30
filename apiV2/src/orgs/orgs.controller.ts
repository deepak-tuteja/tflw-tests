import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrgsService } from './orgs.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';

// Platform-operator-only (decision: org/membership *management* is a system-ADMIN capability
// driven by webV2/admin's new Organizations screen, not customer self-service — there is no
// endpoint here reachable by a plain org owner/admin's own bearer/session token). An org
// owner/admin's elevated *visibility* into their own org's orders/tickets/coupons is a completely
// separate thing, exercised through those resources' own existing endpoints — see
// OrdersService/TicketsService/CouponsService.
@ApiTags('orgs')
@Controller('orgs')
@UseGuards(AnyAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class OrgsController {
  constructor(private readonly orgs: OrgsService) {}

  @Post()
  create(@Body() dto: CreateOrgDto) {
    return this.orgs.create(dto);
  }

  @Get()
  findAll() {
    return this.orgs.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.findOne(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrgDto) {
    return this.orgs.update(id, dto);
  }

  @Get(':id/memberships')
  listMembers(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgs.listMembers(id);
  }

  @Post(':id/memberships')
  addMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateMembershipDto,
  ) {
    return this.orgs.addMember(id, dto);
  }

  @Patch(':id/memberships/:membershipId')
  updateMemberRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    return this.orgs.updateMemberRole(id, membershipId, dto);
  }

  @Delete(':id/memberships/:membershipId')
  @HttpCode(204)
  removeMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.orgs.removeMember(id, membershipId);
  }
}
