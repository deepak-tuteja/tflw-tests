import { IsIn, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

// The token endpoint's three grants (RFC 6749 §4.4, §4.1.3, §6); `whitelist`/`forbidNonWhitelisted`
// (main.ts) reject anything else, same as every other DTO in this app. Each grant's own fields are
// required *for that grant* (`ValidateIf`), so a client-credentials request without a secret is
// still the clean 422 `oauth-token-endpoint.tflw` asserts, and the code grant (tflw `M248`, PKCE)
// needs `code`, `redirect_uri` and `code_verifier` and no secret — its client is public.
export class OauthTokenDto {
  @IsIn(['client_credentials', 'authorization_code', 'refresh_token'])
  grant_type: string;

  @IsString()
  @MinLength(1)
  client_id: string;

  @ValidateIf((o: OauthTokenDto) => o.grant_type === 'client_credentials' || o.client_secret !== undefined)
  @IsString()
  @MinLength(1)
  client_secret?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @ValidateIf((o: OauthTokenDto) => o.grant_type === 'authorization_code')
  @IsString()
  @MinLength(1)
  code?: string;

  @ValidateIf((o: OauthTokenDto) => o.grant_type === 'authorization_code')
  @IsString()
  @MinLength(1)
  redirect_uri?: string;

  @ValidateIf((o: OauthTokenDto) => o.grant_type === 'authorization_code')
  @IsString()
  @MinLength(43)
  code_verifier?: string;

  @ValidateIf((o: OauthTokenDto) => o.grant_type === 'refresh_token')
  @IsString()
  @MinLength(1)
  refresh_token?: string;
}
