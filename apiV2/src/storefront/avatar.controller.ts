import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthedUser } from '../auth/guards/bearer-auth.guard';

// `S-3a` (tflw-tests `PLAN_M239_DOGFOOD_EXPANSION.md`, decision 16): the account page's avatar
// dropzone. The server stores the last avatar per user and echoes what it stored — the filename
// and the byte count — so a `drop file` journey can assert the round trip, and a wrong type is a
// 415 the page shows. In memory on purpose: every regression phase restarts the stack, and an
// avatar is nothing another test reads.
const AVATAR_TYPES = new Set(['image/png', 'image/jpeg']);
const AVATAR_MAX_BYTES = 1024 * 1024;

export interface AvatarRecord {
  filename: string;
  size: number;
  contentType: string;
}

const avatars = new Map<string, AvatarRecord>();

@ApiTags('storefront')
@Controller('profile/avatar')
@UseGuards(AnyAuthGuard)
export class AvatarController {
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: AuthedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): AvatarRecord {
    if (!file)
      throw new HttpException(
        'an avatar file is required',
        HttpStatus.BAD_REQUEST,
      );
    if (!AVATAR_TYPES.has(file.mimetype)) {
      throw new HttpException(
        `an avatar is a PNG or a JPEG, not ${file.mimetype}`,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    if (file.size > AVATAR_MAX_BYTES) {
      throw new HttpException(
        'an avatar is at most 1 MiB',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    const record = {
      filename: file.originalname,
      size: file.size,
      contentType: file.mimetype,
    };
    avatars.set(user.id, record);
    return record;
  }

  // No avatar is a state of the account, not a missing route: `{ avatar: null }` with a 200. A 404
  // here read to the authorization scan as a path the server does not serve at all.
  @Get()
  current(@CurrentUser() user: AuthedUser): { avatar: AvatarRecord | null } {
    return { avatar: avatars.get(user.id) ?? null };
  }
}
