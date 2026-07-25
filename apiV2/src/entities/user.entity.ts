import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  VersionColumn,
} from 'typeorm';
import { Order } from './order.entity';
import { Review } from './review.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  // PLAN_TICKETING.md decision 2 — scoped to the tickets domain only; no other endpoint in the
  // app recognizes this role.
  AGENT = 'agent',
}

@Entity('users')
@Unique(['email'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  // Self-service profile attributes (PLAN_LIFECYCLE.md L1): a flat jsonb bag, updated via
  // RFC 7386 JSON Merge Patch — dynamic add/update/remove-key, not typed profile columns.
  @Column({ type: 'jsonb', default: {} })
  attributes: Record<string, unknown>;

  // Drives the ETag/If-Match optimistic-concurrency cluster for `PATCH /users/me`, same
  // mechanism as Product's `version` (see products.service.ts's etagFor).
  @VersionColumn({ name: 'version' })
  version: number;

  // Set synchronously by JobsService.startAccountDeletion (PLAN_LIFECYCLE.md L2), before the
  // triggering DELETE /users/me request returns — blocks re-auth immediately via
  // AuthService.assertActive, while the rest of the deletion (attribute wipe, token cleanup)
  // finishes asynchronously.
  @Column({ name: 'deactivated_at', type: 'timestamp', nullable: true })
  deactivatedAt: Date | null;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @OneToMany(() => Review, (review) => review.user)
  reviews: Review[];
}
