import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../entities/ticket.entity';
import { TicketComment } from '../entities/ticket-comment.entity';
import { TicketEvent } from '../entities/ticket-event.entity';
import { User } from '../entities/user.entity';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { TicketSlaSweepService } from './ticket-sla-sweep.service';
import { AuthModule } from '../auth/auth.module';
import { OrgsModule } from '../orgs/orgs.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, TicketComment, TicketEvent, User]),
    AuthModule,
    OrgsModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService, TicketSlaSweepService],
  exports: [TicketsService],
})
export class TicketsModule {}
