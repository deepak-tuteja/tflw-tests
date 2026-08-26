import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Ticket, TicketStatus } from '../entities/ticket.entity';
import { TicketEvent, TicketEventType } from '../entities/ticket-event.entity';
import { SLA_SWEEP_BATCH, SLA_SWEEP_INTERVAL_MS } from './sla.constants';
import { isForeignKeyViolation } from '../common/db-errors';

// PLAN_TICKETING.md decision 4 — a real background sweep, not lazy-computed-on-read. Plain
// setInterval/clearInterval, no @nestjs/schedule (consistent with JobsService's hand-rolled-timer
// style; cron-expression syntax is overkill for "scan every 300ms"). Breach is purely
// informational — flips slaBreached/stamps breachedAt, never forces a status transition, keeping
// "workflow stage" and "is it late" as independent axes.
@Injectable()
export class TicketSlaSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TicketSlaSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  // `M154f-08` — `setInterval` fires on a schedule, not on completion. Without this flag a sweep
  // that outruns its 300 ms tick simply gets a second copy of itself started on top, and then a
  // third, each holding its own array of overdue tickets. Under the perf ladder that compounded
  // into a heap OOM; a lock is what makes the interval mean "at most one sweep at a time".
  private sweeping = false;

  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(TicketEvent)
    private readonly events: Repository<TicketEvent>,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      if (this.sweeping) return;
      this.sweeping = true;
      void this.sweep().finally(() => {
        this.sweeping = false;
      });
    }, SLA_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Scans only OPEN/IN_PROGRESS tickets with slaBreached = false and slaDeadline < now. A ticket
  // that leaves that set (resolved/closed/cancelled) is permanently excluded even if it was never
  // breached — no retroactive breaching. Once flipped, slaBreached = false no longer matches, so a
  // later sweep tick never re-stamps breachedAt.
  //
  // `M154f-08` — bounded to `SLA_SWEEP_BATCH` per tick, and ordered by `slaDeadline` so a backlog
  // drains oldest-breach-first rather than in whatever order the planner returns. The predicate is
  // self-clearing (a swept ticket stops matching), so the next tick picks up the next batch with no
  // cursor to keep.
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
      order: { slaDeadline: 'ASC' },
      take: SLA_SWEEP_BATCH,
    });

    for (const ticket of overdue) {
      // M48 (PLAN_BROWSER_PERF_SECURITY.md §2.20) — a ticket found overdue at the top of this
      // sweep can be deleted (e.g. `LoadAdminService.reset()`'s load-test cleanup) before this
      // loop reaches it; the `events.save` below then hits a FK violation on the already-gone
      // ticket_id. Caught and skipped per-ticket, not left to bubble up: `onModuleInit`'s
      // `void this.sweep()` has no caller to catch a rejection, so an uncaught one here used to
      // crash the entire process — a background sweep racing a deletion should never take the
      // whole app down. Any other error still propagates (still logged, not silently swallowed).
      try {
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
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          this.logger.debug(
            `ticket ${ticket.id} deleted concurrently with the SLA sweep — skipped`,
          );
          continue;
        }
        this.logger.error(
          `SLA sweep failed for ticket ${ticket.id}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
