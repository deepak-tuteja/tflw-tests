import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { OrgPlan } from '../../entities/organization.entity';

export class CreateOrgDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({ enum: OrgPlan })
  @IsOptional()
  @IsEnum(OrgPlan)
  plan?: OrgPlan;
}
