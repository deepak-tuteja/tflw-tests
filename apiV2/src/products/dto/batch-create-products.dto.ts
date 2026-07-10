import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

// Deliberately looser than CreateProductDto: `price` has no @Min(0) and `categoryId` is a bare
// string, not @IsUUID(). Batch items must fail independently in the service (per plan_v2.md Part
// E decision 4), not all-or-nothing via the global ValidationPipe — so business-rule checks
// (negative price, unknown category, duplicate name) run per-item after this only structural
// validation passes.
export class BatchProductItemDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsNumber()
  price: number;

  @ApiProperty()
  @IsNumber()
  stock: number;

  @ApiProperty()
  @IsString()
  categoryId: string;
}

export class BatchCreateProductsDto {
  @ApiProperty({ type: [BatchProductItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BatchProductItemDto)
  items: BatchProductItemDto[];
}
