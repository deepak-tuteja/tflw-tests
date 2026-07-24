import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateReviewReplyDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  text: string;

  // Omitted -> a top-level reply on the review itself; present -> nests under that reply
  // (validated against the same review at the service layer, since a UUID alone can't express
  // "belongs to this review").
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentReplyId?: string;
}
