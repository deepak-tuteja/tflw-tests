import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Standard client-credentials grant fields (RFC 6749 §4.4); `whitelist`/`forbidNonWhitelisted`
// (main.ts) reject anything else, same as every other DTO in this app.
export class OauthTokenDto {
  @IsIn(['client_credentials'])
  grant_type: string;

  @IsString()
  @MinLength(1)
  client_id: string;

  @IsString()
  @MinLength(1)
  client_secret: string;

  @IsOptional()
  @IsString()
  scope?: string;
}
