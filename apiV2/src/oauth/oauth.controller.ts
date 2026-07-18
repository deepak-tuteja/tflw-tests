import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OauthService } from './oauth.service';
import { OauthTokenDto } from './dto/oauth-token.dto';

@ApiTags('oauth')
@Controller('oauth')
export class OauthController {
  constructor(private readonly oauth: OauthService) {}

  @Post('token')
  @HttpCode(200)
  token(@Body() dto: OauthTokenDto) {
    return this.oauth.token(dto);
  }
}
