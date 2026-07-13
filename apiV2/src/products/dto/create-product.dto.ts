import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';

// Matches the `numeric(10,2)` column (product.entity.ts) — a price beyond this passed validation
// and hit Postgres's own numeric-overflow error uncaught, surfacing as a raw 500 instead of a
// clean 422 (M19 finding, curl-verified with price: 1e308).
const MAX_PRICE = 99_999_999.99;

export class CreateProductDto {
  // `@MinLength(1)` alone treats whitespace as valid content — "   " passed and created a
  // blank-looking product (M19 finding). `@Matches(/\S/)` requires at least one non-whitespace
  // character without transforming/trimming the submitted value.
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: 'name must not be empty or whitespace-only' })
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE)
  price: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  stock: number;

  @ApiProperty()
  @IsUUID()
  categoryId: string;
}
