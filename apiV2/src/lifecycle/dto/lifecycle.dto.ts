import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LifecycleAttemptDto {
  @ApiProperty({
    description: 'the plant key whose attempt counter this increments',
  })
  @IsString()
  @MinLength(1)
  key: string;
}

export class LifecycleMarkDto {
  @ApiProperty({
    description: 'the label whose arrival counter this increments',
  })
  @IsString()
  @MinLength(1)
  label: string;
}
