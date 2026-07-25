import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity';
import { User } from './user.entity';

export enum TicketEventType {
  CREATED = 'created',
  ASSIGNED = 'assigned',
  CLAIMED = 'claimed',
  STARTED = 'started',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  SLA_BREACHED = 'sla_breached',
}

// PLAN_TICKETING.md decision 7 — a cheap, ticket-scoped instance of PLAN_LIFECYCLE.md's parked
// audit-log item, not the full cross-cutting app-wide version. Each service method appends its
// own event row inline in the same transition it's already performing — no TypeORM subscriber/
// interceptor, no event-sourcing framework. actorUserId is null only for SLA_BREACHED (T2's
// sweep has no human actor). Deliberately excludes comments — isInternal filtering already lives
// on the comments endpoint.
@Entity('ticket_events')
export class TicketEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @Column({ name: 'ticket_id' })
  ticketId: string;

  @Column({ type: 'enum', enum: TicketEventType, name: 'event_type' })
  eventType: TicketEventType;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor: User | null;

  @Column({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
