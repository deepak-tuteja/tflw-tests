import { Body, Controller, Get, Header, Post, Query, Res, UnauthorizedException } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { OauthAuthorizeFormDto, OauthAuthorizeQueryDto } from './dto/oauth-authorize.dto';
import { OauthCodeService, type AuthorizeRequest } from './oauth-code.service';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The consent page: a sign-in form that carries the authorize request forward as hidden fields. */
function consentPage(req: AuthorizeRequest, note?: string): string {
  const hidden = (
    [
      ['response_type', 'code'],
      ['client_id', req.clientId],
      ['redirect_uri', req.redirectUri],
      ['code_challenge', req.challenge],
      ['code_challenge_method', 'S256'],
      ['state', req.state],
      ...(req.scope ? [['scope', req.scope]] : []),
    ] as [string, string][]
  )
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v)}">`)
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Sign in to the storefront</title></head>
<body>
<main>
<h1>Sign in to the storefront</h1>
<p><strong>${esc(req.clientId)}</strong> is asking to act for you${req.scope ? ` with <code>${esc(req.scope)}</code>` : ''}.</p>
${note ? `<p role="alert">${esc(note)}</p>` : ''}
<form method="post" action="/v1/oauth/authorize">
${hidden}
<label for="email">Email</label> <input id="email" name="email" type="email" autocomplete="username">
<label for="password">Password</label> <input id="password" name="password" type="password" autocomplete="current-password">
<button type="submit" name="decision" value="allow">Allow</button>
<button type="submit" name="decision" value="deny">Deny</button>
</form>
</main>
</body></html>`;
}

// tflw `M248` / this repo's `T-2`: `/oauth/authorize`, server-rendered, no webV2 route. Excluded
// from the OpenAPI document like the edge routes: it answers a browser with HTML, and the authz
// crawl seeds from that document, so listing it would have the crawl probe a login form.
@ApiExcludeController()
@Controller('oauth/authorize')
export class OauthAuthorizeController {
  constructor(private readonly code: OauthCodeService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  show(@Query() query: OauthAuthorizeQueryDto): string {
    return consentPage(this.code.validate(query));
  }

  @Post()
  async decide(@Body() form: OauthAuthorizeFormDto, @Res() res: Response): Promise<void> {
    try {
      res.redirect(302, await this.code.decide(form));
    } catch (err) {
      if (!(err instanceof UnauthorizedException)) throw err;
      // Wrong credentials: the same page again, with the reason — the client learns nothing.
      res.status(401).type('html').send(consentPage(this.code.validate(form), 'That email and password do not match an account.'));
    }
  }
}
