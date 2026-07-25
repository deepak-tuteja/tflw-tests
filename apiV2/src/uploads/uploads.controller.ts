import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

@ApiTags('uploads')
@Controller('uploads')
@UseGuards(AnyAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  create(
    @CurrentUser() user: AuthedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.uploads.create(user.id, file);
  }

  // PLAN_FILEFORMATS.md D3/Q6 — `?as=json` swaps the raw-stream response for a JSON envelope over
  // the exact same stored bytes, giving tflw both a `body bytes` target (default) and an ordinary
  // `body.contentBase64` + `base64 decode(...)` target on the same underlying content.
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthedUser,
    @Query('as') as: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | { filename: string; contentType: string; contentBase64: string }> {
    const upload = await this.uploads.findOneScoped(id, user);

    if (as === 'json') {
      return {
        filename: upload.filename,
        contentType: upload.contentType,
        contentBase64: upload.data.toString('base64'),
      };
    }

    res.set({
      'Content-Type': upload.contentType,
      'Content-Disposition': `attachment; filename="${upload.filename}"`,
    });
    return new StreamableFile(upload.data);
  }
}
