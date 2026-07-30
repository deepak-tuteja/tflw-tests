import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { OrgMembership, OrgRole } from '../entities/org-membership.entity';
import { User } from '../entities/user.entity';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { isUniqueViolation } from '../common/db-errors';

export interface CallerMembership {
  orgId: string;
  orgRole: OrgRole;
}

// PLAN_ENTERPRISE_REGRESSION.md E3 — org/membership CRUD (platform-operator-only, gated ADMIN at
// the controller) plus the lookup helpers OrdersService/TicketsService/CouponsService use to
// resolve a *regular* user's own org affiliation for the visibility retrofit. Those two concerns
// share this one service rather than splitting it: the lookup half is a handful of small read
// methods, not enough surface to earn its own module.
@Injectable()
export class OrgsService {
  constructor(
    @InjectRepository(Organization)
    private readonly orgs: Repository<Organization>,
    @InjectRepository(OrgMembership)
    private readonly memberships: Repository<OrgMembership>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async create(dto: CreateOrgDto): Promise<Organization> {
    const org = this.orgs.create({ name: dto.name, plan: dto.plan });
    return this.orgs.save(org);
  }

  findAll(): Promise<Organization[]> {
    return this.orgs.find({ order: { createdAt: 'ASC' } });
  }

  async findOne(id: string): Promise<Organization> {
    const org = await this.orgs.findOne({ where: { id } });
    if (!org) throw new NotFoundException('organization not found');
    return org;
  }

  async update(id: string, dto: UpdateOrgDto): Promise<Organization> {
    const org = await this.findOne(id);
    if (dto.name !== undefined) org.name = dto.name;
    if (dto.plan !== undefined) org.plan = dto.plan;
    return this.orgs.save(org);
  }

  // Deliberately does NOT `relations: { user: true }` — that would serialize the full User
  // entity (including passwordHash) straight into this JSON response, something no other endpoint
  // in this app does (orders/tickets never embed their User relation either). A second, narrow
  // lookup by id keeps only the two safe fields the admin console actually needs to display.
  async listMembers(
    orgId: string,
  ): Promise<Array<OrgMembership & { userEmail: string; userName: string }>> {
    await this.findOne(orgId); // 404s if the org doesn't exist
    const memberships = await this.memberships.find({
      where: { orgId },
      order: { createdAt: 'ASC' },
    });
    const userIds = memberships.map((m) => m.userId);
    const users = userIds.length
      ? await this.users.find({ where: { id: In(userIds) } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return memberships.map((m) => ({
      ...m,
      userEmail: byId.get(m.userId)?.email ?? '(unknown)',
      userName: byId.get(m.userId)?.name ?? '(unknown)',
    }));
  }

  async addMember(
    orgId: string,
    dto: CreateMembershipDto,
  ): Promise<OrgMembership> {
    await this.findOne(orgId); // 404s if the org doesn't exist
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user) throw new NotFoundException(`no user with email "${dto.email}"`);

    const membership = this.memberships.create({
      orgId,
      userId: user.id,
      orgRole: dto.orgRole,
    });
    try {
      return await this.memberships.save(membership);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `${dto.email} is already a member of this organization`,
        );
      }
      throw err;
    }
  }

  private async findMembershipInOrg(
    orgId: string,
    membershipId: string,
  ): Promise<OrgMembership> {
    const membership = await this.memberships.findOne({
      where: { id: membershipId },
    });
    if (!membership || membership.orgId !== orgId) {
      throw new NotFoundException('membership not found in this organization');
    }
    return membership;
  }

  async updateMemberRole(
    orgId: string,
    membershipId: string,
    dto: UpdateMembershipDto,
  ): Promise<OrgMembership> {
    const membership = await this.findMembershipInOrg(orgId, membershipId);
    membership.orgRole = dto.orgRole;
    return this.memberships.save(membership);
  }

  async removeMember(orgId: string, membershipId: string): Promise<void> {
    const membership = await this.findMembershipInOrg(orgId, membershipId);
    await this.memberships.remove(membership);
  }

  // Single-membership lookup for the visibility retrofit (OrdersService/TicketsService/
  // CouponsService). Assumes at most one org per user (this milestone's seed never creates a
  // second) — `findOne` rather than `find`, so a user who somehow ends up in two orgs resolves to
  // whichever membership Postgres returns first, not a documented multi-org priority rule.
  async getForUser(userId: string): Promise<CallerMembership | null> {
    const membership = await this.memberships.findOne({ where: { userId } });
    return membership
      ? { orgId: membership.orgId, orgRole: membership.orgRole }
      : null;
  }

  isOwnerOrAdmin(
    membership: CallerMembership | null,
  ): membership is CallerMembership {
    return (
      membership !== null &&
      (membership.orgRole === OrgRole.OWNER ||
        membership.orgRole === OrgRole.ADMIN)
    );
  }
}
