import { IsIn, IsOptional, IsString } from 'class-validator';

// tflw `M248` (T-2): the authorize request, as a query (GET, RFC 6749 §4.1.1 + RFC 7636 §4.3) and
// as the consent form's body (POST, the same fields carried as hidden inputs plus what the person
// typed). Every field is optional here so a missing one reaches the service's own sentence rather
// than the ValidationPipe's generic one — an authorize request is read by a person in a browser.
export class OauthAuthorizeQueryDto {
  @IsOptional() @IsString() response_type?: string;
  @IsOptional() @IsString() client_id?: string;
  @IsOptional() @IsString() redirect_uri?: string;
  @IsOptional() @IsString() code_challenge?: string;
  @IsOptional() @IsString() code_challenge_method?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() scope?: string;
}

export class OauthAuthorizeFormDto extends OauthAuthorizeQueryDto {
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @IsIn(['allow', 'deny']) decision?: string;
}
