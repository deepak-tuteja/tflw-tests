import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Coupon, CouponType } from '../entities/coupon.entity';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { isUniqueViolation } from '../common/db-errors';

@Injectable()
export class CouponsService {
  constructor(@InjectRepository(Coupon) private readonly coupons: Repository<Coupon>) {}

  // Admin-only fixture-seeding endpoint (M15) — checkout-time validation/redemption lives in
  // OrdersService.applyCoupon, atomically alongside the stock decrement.
  async create(dto: CreateCouponDto): Promise<Coupon> {
    // Cross-field rule the DTO can't express (see create-coupon.dto.ts's comment on `value`): a
    // percent coupon above 100 makes the discount exceed the order subtotal.
    if (dto.type === CouponType.PERCENT && dto.value > 100) {
      throw new UnprocessableEntityException('a percent coupon cannot exceed 100');
    }
    const coupon = this.coupons.create({
      code: dto.code,
      type: dto.type,
      value: String(dto.value),
      expiresAt: new Date(dto.expiresAt),
      minOrderAmount: String(dto.minOrderAmount),
      usageLimit: dto.usageLimit,
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
}
