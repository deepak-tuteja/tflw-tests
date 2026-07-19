import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class RetryDemoDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  key: string;

  @ApiProperty({ required: false, enum: ['seconds', 'date'] })
  @IsOptional()
  @IsIn(['seconds', 'date'])
  format?: 'seconds' | 'date';
}
