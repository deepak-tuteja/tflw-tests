import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OrgPlan {
  STARTER = 'starter',
  BUSINESS = 'business',
  ENTERPRISE = 'enterprise',
}

// PLAN_ENTERPRISE_REGRESSION.md E3 — a customer company using the storefront on a B2B basis, not
// a second tier of the existing system-level UserRole (admin|user|agent stays untouched; orgRole
// on OrgMembership is a second, independent axis). Product/category catalog stays global/shared
// (decision 3) — organizations never own or scope the marketplace catalog itself.
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: OrgPlan, default: OrgPlan.STARTER })
  plan: OrgPlan;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
