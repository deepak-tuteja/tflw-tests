import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum ReturnRequestDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class DecideReturnRequestDto {
  @ApiProperty({ enum: ReturnRequestDecision })
  @IsEnum(ReturnRequestDecision)
  decision: ReturnRequestDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
