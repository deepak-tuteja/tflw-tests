import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';
import { OauthCodeService } from './oauth-code.service';
import { OauthAuthorizeController } from './oauth-authorize.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [OauthController, OauthAuthorizeController],
  providers: [OauthService, OauthCodeService],
})
export class OauthModule {}
