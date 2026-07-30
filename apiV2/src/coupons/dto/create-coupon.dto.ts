import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { CouponType } from '../../entities/coupon.entity';

export class CreateCouponDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  code: string;

  @ApiProperty({ enum: CouponType })
  @IsEnum(CouponType)
  type: CouponType;

  // The `type === percent` upper bound (100) is a cross-field rule — class-validator's
  // `@ValidateIf` gates an entire property's validators, not individual ones, so it can't
  // conditionally add @Max(100) on top of an unconditional @Min(0) here. Enforced in
  // CouponsService.create instead (M19 finding).
  @ApiProperty()
  @IsNumber()
  @Min(0)
  value: number;

  @ApiProperty()
  @IsISO8601()
  expiresAt: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  minOrderAmount: number;

  @ApiProperty()
  @IsInt()
  @Min(1)
  usageLimit: number;

  // PLAN_ENTERPRISE_REGRESSION.md E3 — omitted/undefined = a global coupon (today's only
  // behavior). A system ADMIN may set this to any org's id; an org owner/admin caller may only
  // ever create a coupon for their *own* org — CouponsService.create enforces both, ignoring an
  // org caller's mismatched value rather than trusting it.
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orgId?: string;
}
