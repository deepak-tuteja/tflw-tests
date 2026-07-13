import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(AnyAuthGuard)
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthedUser) {
    return this.jobs.findOneScoped(id, user);
  }
}
