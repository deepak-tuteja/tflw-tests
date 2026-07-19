import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ProfileExportService } from './profile-export.service';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

@ApiTags('profile-export')
@Controller('profile')
export class ProfileExportController {
  constructor(private readonly profileExport: ProfileExportService) {}

  @Get('export')
  @UseGuards(AnyAuthGuard)
  export(@CurrentUser() user: AuthedUser) {
    return this.profileExport.export(user.id);
  }
}
