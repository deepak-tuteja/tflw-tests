import { ApiProperty } from '@nestjs/swagger';

// Swagger-only response shape (the controller still returns the real Product entity at runtime;
// this just gives /openapi.json a documented schema to validate against — plan_v2.md Cluster 2's
// "so scenarios can attempt schema/contract assertions", exercised by M5's gap-provoking suite.
export class ProductResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() description: string;
  @ApiProperty() price: string;
  @ApiProperty() stock: number;
  @ApiProperty() categoryId: string;
  @ApiProperty() version: number;
  @ApiProperty() createdAt: string;
  @ApiProperty() updatedAt: string;
}
