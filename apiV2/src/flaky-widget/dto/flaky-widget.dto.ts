import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class FlakyWidgetDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  key: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;
}
