import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrgRole } from '../../entities/org-membership.entity';

export class UpdateMembershipDto {
  @ApiProperty({ enum: OrgRole })
  @IsEnum(OrgRole)
  orgRole: OrgRole;
}
