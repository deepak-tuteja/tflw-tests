import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Ticket, TicketStatus } from '../entities/ticket.entity';
import { TicketEvent, TicketEventType } from '../entities/ticket-event.entity';
import { SLA_SWEEP_INTERVAL_MS } from './sla.constants';

// PLAN_TICKETING.md decision 4 — a real background sweep, not lazy-computed-on-read. Plain
// setInterval/clearInterval, no @nestjs/schedule (consistent with JobsService's hand-rolled-timer
// style; cron-expression syntax is overkill for "scan every 300ms"). Breach is purely
// informational — flips slaBreached/stamps breachedAt, never forces a status transition, keeping
// "workflow stage" and "is it late" as independent axes.
@Injectable()
export class TicketSlaSweepService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(TicketEvent)
    private readonly events: Repository<TicketEvent>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.sweep();
    }, SLA_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Scans only OPEN/IN_PROGRESS tickets with slaBreached = false and slaDeadline < now. A ticket
  // that leaves that set (resolved/closed/cancelled) is permanently excluded even if it was never
  // breached — no retroactive breaching. Once flipped, slaBreached = false no longer matches, so a
  // later sweep tick never re-stamps breachedAt.
  private async sweep(): Promise<void> {
    const now = new Date();
    const overdue = await this.tickets.find({
      where: [
        {
          status: TicketStatus.OPEN,
          slaBreached: false,
          slaDeadline: LessThan(now),
        },
        {
          status: TicketStatus.IN_PROGRESS,
          slaBreached: false,
          slaDeadline: LessThan(now),
        },
      ],
    });

    for (const ticket of overdue) {
      await this.tickets.update(ticket.id, {
        slaBreached: true,
        breachedAt: new Date(),
      });
      await this.events.save(
        this.events.create({
          ticketId: ticket.id,
          eventType: TicketEventType.SLA_BREACHED,
          actorUserId: null,
        }),
      );
    }
  }
}
