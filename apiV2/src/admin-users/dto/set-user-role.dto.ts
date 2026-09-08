import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserRole } from '../../entities/user.entity';

export class SetUserRoleDto {
  // `IsEnum` is what makes an unknown role a 422 rather than a silently-stored string: the global
  // ValidationPipe's `exceptionFactory` maps every class-validator failure through
  // `toValidationProblem`, which is an `UnprocessableEntityException` (main.ts). Nothing in this
  // module raises that status itself.
  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;
}
