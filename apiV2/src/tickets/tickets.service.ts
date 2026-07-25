import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket, TicketStatus } from '../entities/ticket.entity';
import { TicketComment } from '../entities/ticket-comment.entity';
import { TicketEvent, TicketEventType } from '../entities/ticket-event.entity';
import { User, UserRole } from '../entities/user.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto';
import { FindTicketsQueryDto } from './dto/find-tickets-query.dto';
import { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { SLA_WINDOW_MS } from './sla.constants';

// PLAN_TICKETING.md T1 — sync ticket-domain mechanics: creation, role-scoped read/list, the
// assign/claim pair (decision 6), the full open->claim->start->resolve->close chain, the owner's
// cancel/withdraw (decision 3, no ADMIN/AGENT override — explicitly the owner's "never mind"),
// role-filtered comments (decision 5), and a ticket-scoped history (decision 7). All 409-race
// handling here is plain check-then-update — same precedent as return-requests.service.ts, no
// transaction/row-lock/version column.
@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    @InjectRepository(TicketComment)
    private readonly comments: Repository<TicketComment>,
    @InjectRepository(TicketEvent)
    private readonly events: Repository<TicketEvent>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  private async logEvent(
    ticketId: string,
    eventType: TicketEventType,
    actorUserId: string | null,
  ): Promise<void> {
    await this.events.save(
      this.events.create({ ticketId, eventType, actorUserId }),
    );
  }

  // Decision 2's visibility rule: ADMIN sees everything; the owner always sees their own ticket;
  // an AGENT sees a ticket only while it's assigned to them or still unclaimed (to claim it) —
  // never a ticket assigned to a different agent.
  private canView(ticket: Ticket, requester: AuthedUser): boolean {
    if (requester.role === UserRole.ADMIN) return true;
    if (ticket.submittedBy === requester.id) return true;
    if (requester.role === UserRole.AGENT) {
      return ticket.assignedTo === null || ticket.assignedTo === requester.id;
    }
    return false;
  }

  // ADMIN always counts (decision 2's "override any agent's status change"); an AGENT only counts
  // for the ticket currently assigned to them.
  private isAssignedActor(ticket: Ticket, requester: AuthedUser): boolean {
    if (requester.role === UserRole.ADMIN) return true;
    return (
      requester.role === UserRole.AGENT && ticket.assignedTo === requester.id
    );
  }

  async create(userId: string, dto: CreateTicketDto): Promise<Ticket> {
    const ticket = this.tickets.create({
      subject: dto.subject,
      description: dto.description,
      submittedBy: userId,
      // T2's sweep target — stamped here (not left null until T2) since T1 and T2 share the same
      // Ticket row; decision 4's SLA_WINDOW_MS.
      slaDeadline: new Date(Date.now() + SLA_WINDOW_MS),
    });
    const saved = await this.tickets.save(ticket);
    await this.logEvent(saved.id, TicketEventType.CREATED, userId);
    return saved;
  }

  async findOneScoped(id: string, requester: AuthedUser): Promise<Ticket> {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket || !this.canView(ticket, requester)) {
      throw new NotFoundException('ticket not found');
    }
    return ticket;
  }

  // Role-scoping is layered under the query.* filters (decision 8) via a plain QueryBuilder,
  // same style as products.service.ts's findAll — no pagination envelope (decision 8: already
  // thoroughly proven elsewhere, re-adding it here would dilute this addition's actual point).
  async findAllScoped(
    requester: AuthedUser,
    query: FindTicketsQueryDto,
  ): Promise<Ticket[]> {
    const qb = this.tickets.createQueryBuilder('ticket');

    if (requester.role === UserRole.USER) {
      qb.andWhere('ticket.submitted_by = :userId', { userId: requester.id });
    } else if (requester.role === UserRole.AGENT) {
      qb.andWhere(
        '(ticket.assigned_to = :agentId OR ticket.assigned_to IS NULL)',
        { agentId: requester.id },
      );
    }

    if (query.status) {
      qb.andWhere('ticket.status = :status', { status: query.status });
    }
    if (query.slaBreached !== undefined) {
      qb.andWhere('ticket.sla_breached = :slaBreached', {
        slaBreached: query.slaBreached,
      });
    }
    if (query.assignedTo) {
      qb.andWhere('ticket.assigned_to = :assignedTo', {
        assignedTo: query.assignedTo,
      });
    }

    qb.orderBy('ticket.created_at', 'ASC');
    return qb.getMany();
  }

  // ADMIN-only (enforced by the controller's @Roles guard). Assign/reassign to any AGENT —
  // decision 2's "ADMIN keeps blanket authority."
  async assign(
    id: string,
    dto: AssignTicketDto,
    adminId: string,
  ): Promise<Ticket> {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('ticket not found');

    const assignee = await this.users.findOne({
      where: { id: dto.assigneeId },
    });
    if (!assignee) throw new NotFoundException('assignee not found');
    if (assignee.role !== UserRole.AGENT) {
      throw new UnprocessableEntityException(
        'assignee must have the agent role',
      );
    }

    ticket.assignedTo = dto.assigneeId;
    const saved = await this.tickets.save(ticket);
    await this.logEvent(id, TicketEventType.ASSIGNED, adminId);
    return saved;
  }

  // AGENT-only (enforced by the controller's @Roles guard) — decision 6's first-caller-wins 409,
  // same shape as return-requests.service.ts's duplicate-submission check: a plain check-then-
  // update, no row lock. Deliberately not routed through findOneScoped/canView — a ticket already
  // claimed by someone else 404s on every other endpoint, but this one's own conflict signal is
  // an explicit 409 (decision 6's literal text), since the caller just attempted this specific
  // action on this specific id.
  async claim(id: string, agentId: string): Promise<Ticket> {
    const ticket = await this.tickets.findOne({ where: { id } });
    if (!ticket) throw new NotFoundException('ticket not found');
    if (ticket.assignedTo !== null) {
      throw new ConflictException(
        ticket.assignedTo === agentId
          ? 'you have already claimed this ticket'
          : 'ticket is already claimed by another agent',
      );
    }

    ticket.assignedTo = agentId;
    const saved = await this.tickets.save(ticket);
    await this.logEvent(id, TicketEventType.CLAIMED, agentId);
    return saved;
  }

  async start(id: string, requester: AuthedUser): Promise<Ticket> {
    const ticket = await this.findOneScoped(id, requester);
    if (!this.isAssignedActor(ticket, requester)) {
      throw new ForbiddenException('not the assigned agent');
    }
    if (ticket.status !== TicketStatus.OPEN) {
      throw new ConflictException(
        `ticket is "${ticket.status}", not "open" — it cannot be started`,
      );
    }

    ticket.status = TicketStatus.IN_PROGRESS;
    const saved = await this.tickets.save(ticket);
    await this.logEvent(id, TicketEventType.STARTED, requester.id);
    return saved;
  }

  async resolve(id: string, requester: AuthedUser): Promise<Ticket> {
    const ticket = await this.findOneScoped(id, requester);
    if (!this.isAssignedActor(ticket, requester)) {
      throw new ForbiddenException('not the assigned agent');
    }
    if (ticket.status !== TicketStatus.IN_PROGRESS) {
      throw new ConflictException(
        `ticket is "${ticket.status}", not "in_progress" — it cannot be resolved`,
      );
    }

    ticket.status = TicketStatus.RESOLVED;
    const saved = await this.tickets.save(ticket);
    await this.logEvent(id, TicketEventType.RESOLVED, requester.id);
    return saved;
  }

  // Owner-only — deliberately mirrors cancel's own restriction (decision 3): no ADMIN/AGENT
  // override, this is the owner confirming the resolution themselves.
  async close(id: string, requester: AuthedUser): Promise<Ticket> {
    const ticket = await this.findOneScoped(id, requester);
    if (ticket.submittedBy !== requester.id) {
      throw new ForbiddenException('not your ticket');
    }
    if (ticket.status !== TicketStatus.RESOLVED) {
      throw new ConflictException(
        `ticket is "${ticket.status}", not "resolved" — it cannot be closed`,
      );
    }

    ticket.status = TicketStatus.CLOSED;
    const saved = await this.tickets.save(ticket);
    await this.logEvent(id, TicketEventType.CLOSED, requester.id);
    return saved;
  }

  // Owner-only, from OPEN/IN_PROGRESS only (decision 3) — this app's first cross-endpoint race:
  // an agent's concurrent `resolve` moves the ticket to RESOLVED, which this check then rejects
  // (409) just as plainly as `resolve`'s own precondition would reject a concurrent `cancel`.
  async cancel(id: string, requester: AuthedUser): Promise<Ticket> {
    const ticket = await this.findOneScoped(id, requester);
    if (ticket.submittedBy !== requester.id) {
      throw new ForbiddenException('not your ticket');
    }
    if (
      ticket.status !== TicketStatus.OPEN &&
      ticket.status !== TicketStatus.IN_PROGRESS
    ) {
      throw new ConflictException(
        `ticket is "${ticket.status}" — it cannot be cancelled`,
      );
    }

    ticket.status = TicketStatus.CANCELLED;
    const saved = await this.tickets.save(ticket);
    await this.logEvent(id, TicketEventType.CANCELLED, requester.id);
    return saved;
  }

  // Role-filtered response body (decision 5) — the suite's first "same endpoint, different
  // response body by role" case, distinct from every existing all-or-nothing 403/404 authz check.
  async addComment(
    id: string,
    requester: AuthedUser,
    dto: CreateTicketCommentDto,
  ): Promise<TicketComment> {
    await this.findOneScoped(id, requester);
    if (dto.isInternal && requester.role === UserRole.USER) {
      throw new ForbiddenException(
        'only an agent or admin may post an internal comment',
      );
    }

    const comment = this.comments.create({
      ticketId: id,
      authorUserId: requester.id,
      text: dto.text,
      isInternal: dto.isInternal ?? false,
    });
    return this.comments.save(comment);
  }

  async findCommentsScoped(
    id: string,
    requester: AuthedUser,
  ): Promise<TicketComment[]> {
    await this.findOneScoped(id, requester);
    const qb = this.comments
      .createQueryBuilder('comment')
      .where('comment.ticket_id = :id', { id })
      .orderBy('comment.created_at', 'ASC');

    if (requester.role === UserRole.USER) {
      qb.andWhere('comment.is_internal = false');
    }

    return qb.getMany();
  }

  // Deliberately excludes comments (decision 7) — same visibility as the ticket itself, not a
  // further-filtered subset.
  async findHistoryScoped(
    id: string,
    requester: AuthedUser,
  ): Promise<TicketEvent[]> {
    await this.findOneScoped(id, requester);
    return this.events
      .createQueryBuilder('event')
      .where('event.ticket_id = :id', { id })
      .orderBy('event.created_at', 'ASC')
      .getMany();
  }
}
