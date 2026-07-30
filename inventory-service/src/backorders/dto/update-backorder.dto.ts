import { IsEnum } from "class-validator";
import { BackorderStatus } from "../../entities/backorder-request.entity";

export class UpdateBackorderDto {
  @IsEnum(BackorderStatus)
  status: BackorderStatus;
}
