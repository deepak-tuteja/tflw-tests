import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsUUID,
  IsUrl,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemInputDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @ValidateNested({ each: true })
  @Type(() => OrderItemInputDto)
  @ArrayMinSize(1)
  items: OrderItemInputDto[];

  // M33 (plan_v2.md Part R Cluster C) — an order-completion webhook delivery target.
  // `require_tld: false` deliberately allows a bare `http://127.0.0.1:PORT/...` receiver, since
  // this app's only real caller of this field is testFlow-tests' own JS-escape-hatch throwaway
  // HTTP receiver, not a public internet endpoint.
  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  webhookUrl?: string;
}
