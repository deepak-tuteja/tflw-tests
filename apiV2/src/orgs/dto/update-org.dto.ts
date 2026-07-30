import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { OrgPlan } from '../../entities/organization.entity';

export class UpdateOrgDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({ enum: OrgPlan })
  @IsOptional()
  @IsEnum(OrgPlan)
  plan?: OrgPlan;
}
