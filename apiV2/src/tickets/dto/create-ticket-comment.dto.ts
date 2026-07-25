import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTicketCommentDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text: string;

  // Defaults to false; only ADMIN/AGENT may set this true (decision 5) — enforced in
  // TicketsService.addComment, not here, since it depends on the caller's role.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}
