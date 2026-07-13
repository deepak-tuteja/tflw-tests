import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsInt, IsNumber, IsString, Min, MinLength } from 'class-validator';
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
}
