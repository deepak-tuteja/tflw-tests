import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { TokenRecord } from '../entities/token-record.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { TokenRecordsService } from './token-records.service';
import { BearerAuthGuard } from './guards/bearer-auth.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AnyAuthGuard } from './guards/any-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, TokenRecord]), JwtModule.register({})],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    TokenRecordsService,
    BearerAuthGuard,
    SessionAuthGuard,
    AnyAuthGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    TokensService,
    TokenRecordsService,
    BearerAuthGuard,
    SessionAuthGuard,
    AnyAuthGuard,
    RolesGuard,
  ],
})
export class AuthModule {}
