import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateReturnRequestDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  reason: string;
}
