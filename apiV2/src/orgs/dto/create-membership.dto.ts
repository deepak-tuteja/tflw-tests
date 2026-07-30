import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum } from 'class-validator';
import { OrgRole } from '../../entities/org-membership.entity';

// Takes an email, not a userId — UsersController is deliberately self-service-only (no
// admin-driven user management/lookup endpoint exists, PLAN_LIFECYCLE.md L1 decision 3), so this
// is the only user-facing way to identify who's being added without growing that surface just for
// this screen. OrgsService resolves it to a userId server-side.
export class CreateMembershipDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ enum: OrgRole })
  @IsEnum(OrgRole)
  orgRole: OrgRole;
}
