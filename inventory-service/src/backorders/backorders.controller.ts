import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BackordersService } from "./backorders.service";
import { UpdateBackorderDto } from "./dto/update-backorder.dto";

@ApiTags("backorders")
@Controller("backorders")
export class BackordersController {
  constructor(private readonly backorders: BackordersService) {}

  @Get()
  findAll(@Query("productId") productId?: string) {
    return this.backorders.findAll(productId);
  }

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.backorders.findOne(id);
  }

  @Patch(":id")
  setStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateBackorderDto,
  ) {
    return this.backorders.setStatus(id, dto.status);
  }
}
