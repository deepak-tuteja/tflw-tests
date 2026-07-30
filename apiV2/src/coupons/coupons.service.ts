import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, CouponType } from '../entities/coupon.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { isUniqueViolation } from '../common/db-errors';
import { AuthedUser } from '../auth/guards/bearer-auth.guard';
import { UserRole } from '../entities/user.entity';
import { OrgsService } from '../orgs/orgs.service';

@Injectable()
export class CouponsService {
  constructor(
    @InjectRepository(Coupon) private readonly coupons: Repository<Coupon>,
    private readonly orgs: OrgsService,
  ) {}

  // Checkout-time validation/redemption lives in OrdersService.applyCoupon, atomically alongside
  // the stock decrement. PLAN_ENTERPRISE_REGRESSION.md E3 — creation authority: a system ADMIN
  // may create a global coupon (orgId omitted) or one for any org; an org owner/admin may only
  // create one scoped to their *own* org (their membership's orgId always wins over whatever the
  // DTO says, so they can't create a coupon for a different org by just naming its id); anyone
  // else (a plain member, or no org at all) is forbidden.
  async create(dto: CreateCouponDto, requester: AuthedUser): Promise<Coupon> {
    // Cross-field rule the DTO can't express (see create-coupon.dto.ts's comment on `value`): a
    // percent coupon above 100 makes the discount exceed the order subtotal.
    if (dto.type === CouponType.PERCENT && dto.value > 100) {
      throw new UnprocessableEntityException(
        'a percent coupon cannot exceed 100',
      );
    }

    let orgId: string | null;
    if (requester.role === UserRole.ADMIN) {
      orgId = dto.orgId ?? null;
    } else {
      const membership = await this.orgs.getForUser(requester.id);
      if (!this.orgs.isOwnerOrAdmin(membership)) {
        throw new ForbiddenException(
          'requires system ADMIN, or an owner/admin membership in an organization',
        );
      }
      orgId = membership.orgId;
    }

    const coupon = this.coupons.create({
      code: dto.code,
      type: dto.type,
      value: String(dto.value),
      expiresAt: new Date(dto.expiresAt),
      minOrderAmount: String(dto.minOrderAmount),
      usageLimit: dto.usageLimit,
      orgId,
    });
    try {
      return await this.coupons.save(coupon);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException('a coupon with this code already exists');
      }
      throw err;
    }
  }

  // New (E3) — apiV2 had no coupon-listing endpoint at all before this. System ADMIN sees every
  // coupon; an org owner/admin sees their own org's coupons plus every global one; anyone else
  // (a plain member, or no org) is forbidden — redeeming a coupon at checkout needs no listing
  // access, only OrdersService.applyCoupon's own org check.
  async findAllVisible(requester: AuthedUser): Promise<Coupon[]> {
    if (requester.role === UserRole.ADMIN) {
      return this.coupons.find({ order: { createdAt: 'DESC' } });
    }
    const membership = await this.orgs.getForUser(requester.id);
    if (!this.orgs.isOwnerOrAdmin(membership)) {
      throw new ForbiddenException(
        'requires system ADMIN, or an owner/admin membership in an organization',
      );
    }
    return this.coupons
      .createQueryBuilder('coupon')
      .where('coupon.org_id = :orgId OR coupon.org_id IS NULL', {
        orgId: membership.orgId,
      })
      .orderBy('coupon.created_at', 'DESC')
      .getMany();
  }
}
