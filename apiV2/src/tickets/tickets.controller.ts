import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';

@ApiTags('tickets')
@Controller('tickets')
@UseGuards(AnyAuthGuard, RolesGuard)
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  // No @Roles restriction — any authenticated identity submits as themselves (decision 3), same
  // as return-requests.service.ts's submit().
  @Post()
  create(@CurrentUser() user: AuthedUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthedUser,
    @Query() query: FindTicketsQueryDto,
  ) {
    return this.tickets.findAllScoped(user, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.findOneScoped(id, user);
  }

  // ADMIN-only (decision 6) — assign/reassign to any AGENT.
  @Patch(':id/assign')
  @Roles(UserRole.ADMIN)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.assign(id, dto, user.id);
  }

  // 200, not the POST default 201 — claim mutates an existing ticket, it doesn't create a new
  // resource (same convention as reviews' reply endpoint). AGENT-only (decision 6) — only if
  // currently unassigned.
  @Post(':id/claim')
  @HttpCode(200)
  @Roles(UserRole.AGENT)
  claim(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.claim(id, user.id);
  }

  // ADMIN/AGENT at the route level; the service's isAssignedActor narrows AGENT further to
  // "assigned to them specifically."
  @Post(':id/start')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.AGENT)
  start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.start(id, user);
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.AGENT)
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.resolve(id, user);
  }

  // No @Roles restriction — owner-only, enforced in the service (decision 3).
  @Post(':id/close')
  @HttpCode(200)
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.close(id, user);
  }

  // No @Roles restriction — owner-only, enforced in the service (decision 3 — not ADMIN/AGENT).
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.cancel(id, user);
  }

  @Post(':id/comments')
  addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
    @Body() dto: CreateTicketCommentDto,
  ) {
    return this.tickets.addComment(id, user, dto);
  }

  @Get(':id/comments')
  findComments(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.findCommentsScoped(id, user);
  }

  @Get(':id/history')
  findHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.tickets.findHistoryScoped(id, user);
  }
}
