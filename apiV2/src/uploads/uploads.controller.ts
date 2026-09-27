import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
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

  // tflw `M245` — several files in one request, under any field names, a name allowed to repeat.
  // `AnyFilesInterceptor` keeps multer's arrival order, so `parts` answers "did the parts go out in
  // the order the test wrote them", and each part names the field it came under.
  @Post('batch')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 10 } }))
  async createBatch(
    @CurrentUser() user: AuthedUser,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const parts = await this.uploads.createMany(user.id, files);
    return { title: typeof body.title === 'string' ? body.title : null, count: parts.length, parts };
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
  ): Promise<
    | StreamableFile
    | { filename: string; contentType: string; contentBase64: string }
  > {
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
