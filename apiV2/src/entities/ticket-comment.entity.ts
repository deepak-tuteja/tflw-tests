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

// PLAN_TICKETING.md decision 5 — flat, chronological, no nested threading (review-threads.tflw
// already proves that shape; reusing it here would just re-derive it, not add new surface).
// isInternal notes are postable by ADMIN/AGENT and invisible to the ticket owner — the suite's
// first "same endpoint, different response body by role" case.
@Entity('ticket_comments')
export class TicketComment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Ticket;

  @Column({ name: 'ticket_id' })
  ticketId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'author_user_id' })
  author: User;

  @Column({ name: 'author_user_id' })
  authorUserId: string;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'is_internal', type: 'boolean', default: false })
  isInternal: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
