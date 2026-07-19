import { ApiProperty } from '@nestjs/swagger';

// Deliberately drifted Swagger-only response shape (PLAN decision 102a, enterprise arc cluster 3,
// PLAN_ENTERPRISE.md decision 11's "one deliberately-drifted endpoint" fixture) — documents a
// `price` the real handler never returns, proving tflw's `matches schema` contract matcher
// actually catches real drift instead of always passing. Mirrors `product-response.dto.ts`'s
// "Swagger-only shape, not the real return type" pattern.
export class DriftedWidgetResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() price: number;
}
