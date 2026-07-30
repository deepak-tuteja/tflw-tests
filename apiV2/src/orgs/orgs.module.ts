import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../entities/organization.entity';
import { OrgMembership } from '../entities/org-membership.entity';
import { User } from '../entities/user.entity';
import { OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, OrgMembership, User]),
    AuthModule,
  ],
  controllers: [OrgsController],
  providers: [OrgsService],
  // Exported so OrdersModule/TicketsModule/CouponsModule can inject OrgsService for the
  // visibility-retrofit lookup (getForUser/isOwnerOrAdmin), not just this module's own CRUD.
  exports: [OrgsService],
})
export class OrgsModule {}
