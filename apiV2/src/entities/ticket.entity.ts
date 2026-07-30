import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
}

// PLAN_TICKETING.md T1 — a third role (AGENT) scoped to specific resource instances (assigned-to-
// them or unclaimed), a real background SLA sweep (T2) driving slaBreached/breachedAt independent
// of status, and the suite's first cross-endpoint race (owner-cancels vs. agent-resolves).
// slaDeadline/slaBreached/breachedAt are added here (not in a second T2 migration) even though T2
// is the milestone that actually populates them — T1 just never sets them non-default.
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.OPEN })
  status: TicketStatus;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'submitted_by' })
  submittedByUser: User;

  @Column({ name: 'submitted_by' })
  submittedBy: string;

  // Nullable until claimed/assigned; exactly one AGENT at a time (decision 6 — claim is a
  // first-caller-wins 409, same shape as PLAN_RETURNS.md's duplicate-submission check).
  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignedToUser: User | null;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo: string | null;

  @Column({ name: 'sla_deadline', type: 'timestamp', nullable: true })
  slaDeadline: Date | null;

  @Column({ name: 'sla_breached', type: 'boolean', default: false })
  slaBreached: boolean;

  @Column({ name: 'breached_at', type: 'timestamp', nullable: true })
  breachedAt: Date | null;

  // PLAN_ENTERPRISE_REGRESSION.md E3 — denormalized from the submitter's org membership at
  // creation time (null if they have none). Broadens canView/findAllScoped for an org owner/admin
  // to every ticket submitted by any member of their org, on top of the existing
  // submitted-by-me/assigned-to-me rules (both unaffected for a plain USER or an AGENT).
  @Column({ name: 'org_id', type: 'uuid', nullable: true })
  orgId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
