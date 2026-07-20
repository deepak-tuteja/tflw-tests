import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AnyAuthGuard } from './guards/any-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { AuthedUser } from './guards/bearer-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refreshToken);
    return { status: 'ok' };
  }

  @Get('profile')
  @UseGuards(AnyAuthGuard)
  profile(@CurrentUser() user: AuthedUser) {
    return this.auth.profile(user.id);
  }

  @Post('session-login')
  @HttpCode(200)
  sessionLogin(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.sessionLogin(dto, res, { withRefreshCookie: false });
  }

  // Distinct from `session-login` so tflw.config's globally-cached `shopper` session (used by
  // most cookie-authed tests) only ever sees a single Set-Cookie header — capturing it and
  // replaying it as a plain `Cookie` header stays declarative. This endpoint's dedicated
  // session-refresh-cookie test is the only caller that needs the second (session_refresh)
  // cookie, and it asserts the raw header directly rather than chaining it forward.
  @Post('session-login-full')
  @HttpCode(200)
  sessionLoginFull(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.sessionLogin(dto, res, { withRefreshCookie: true });
  }

  @Post('session-refresh')
  @HttpCode(200)
  sessionRefresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionRefreshCookie = req.cookies?.session_refresh as
      string | undefined;
    return this.auth.sessionRefresh(sessionRefreshCookie, res);
  }

  @Post('session-logout')
  @HttpCode(200)
  async sessionLogout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionCookie = req.cookies?.session as string | undefined;
    const sessionRefreshCookie = req.cookies?.session_refresh as
      string | undefined;
    await this.auth.sessionLogout(sessionCookie, sessionRefreshCookie, res);
    return { status: 'ok' };
  }
}
