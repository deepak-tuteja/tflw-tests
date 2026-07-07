import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class FindProductsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  // Full-text search across name + description (Postgres to_tsvector/plainto_tsquery).
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;

  // One of name|-name|price|-price|stock|-stock; a leading `-` means descending.
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sort?: string;

  // page/pageSize only switch the response into the paginated {data,page,...} envelope when both
  // are given — the bare array shape used throughout M1-M3's tests stays the default.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
