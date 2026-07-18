import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { OauthController } from './oauth.controller';
import { OauthService } from './oauth.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [OauthController],
  providers: [OauthService],
})
export class OauthModule {}
