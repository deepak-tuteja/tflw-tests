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
