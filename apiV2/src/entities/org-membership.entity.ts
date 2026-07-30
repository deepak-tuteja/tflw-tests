import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Organization } from './organization.entity';
import { User } from './user.entity';

export enum OrgRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
}

// PLAN_ENTERPRISE_REGRESSION.md E3 — user x org, one membership per (org, user) pair. This
// retrofit seeds exactly one membership per org-affiliated user (no multi-org users yet); the
// schema itself doesn't forbid a user joining a second org, that's just not exercised here.
@Entity('org_memberships')
@Unique(['orgId', 'userId'])
export class OrgMembership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'org_id' })
  organization: Organization;

  @Column({ name: 'org_id' })
  orgId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column({
    name: 'org_role',
    type: 'enum',
    enum: OrgRole,
    default: OrgRole.MEMBER,
  })
  orgRole: OrgRole;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
