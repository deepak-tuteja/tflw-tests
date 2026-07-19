import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { ProfileExportController } from './profile-export.controller';
import { ProfileExportService } from './profile-export.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [ProfileExportController],
  providers: [ProfileExportService],
})
export class ProfileExportModule {}
