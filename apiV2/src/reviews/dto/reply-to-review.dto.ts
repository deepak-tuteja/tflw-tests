import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ReplyToReviewDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  replyText: string;
}
