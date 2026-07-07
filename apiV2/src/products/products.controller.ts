import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  MethodNotAllowedException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { ProductsService, etagFor } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { AnyAuthGuard } from '../auth/guards/any-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../entities/user.entity';

// Reads are public (browsing a catalog needs no auth); writes are admin-only.
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  findAll(@Query() query: FindProductsQueryDto) {
    return this.products.findAll(query);
  }

  // ETag/If-None-Match conditional GET (RFC7232): a client holding the same version it already
  // fetched gets a bodyless 304 instead of the full representation again.
  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const product = await this.products.findOne(id);
    const etag = etagFor(product);
    res.setHeader('ETag', etag);
    if (ifNoneMatch === etag) {
      res.status(304);
      return;
    }
    return product;
  }

  @Post()
  @UseGuards(AnyAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async create(@Body() dto: CreateProductDto, @Res({ passthrough: true }) res: Response) {
    const product = await this.products.create(dto);
    res.setHeader('ETag', etagFor(product));
    return product;
  }

  // Only partial updates are supported — a full-replace PUT is a deliberately unsupported verb
  // on this resource, a genuine 405 rather than routing falling through to a 404.
  @Put(':id')
  @UseGuards(AnyAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  replaceNotSupported(): never {
    throw new MethodNotAllowedException('products only support partial updates — use PATCH');
  }

  // If-Match conditional PATCH (RFC7232): enforced only when the caller sends it, so this stays
  // optimistic-concurrency (a courtesy check), not a mandatory lock.
  @Patch(':id')
  @UseGuards(AnyAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const updated = await this.products.update(id, dto, ifMatch);
    res.setHeader('ETag', etagFor(updated));
    return updated;
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AnyAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async remove(@Param('id') id: string) {
    await this.products.remove(id);
  }
}
