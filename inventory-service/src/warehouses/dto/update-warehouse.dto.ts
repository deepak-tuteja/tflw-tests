import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  location?: string;
}
