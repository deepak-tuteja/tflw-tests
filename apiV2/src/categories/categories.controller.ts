import {
  Controller,
  Delete,
  Get,
  MethodNotAllowedException,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';

// Read-only — just enough for tests to look up a real category id before creating a product.
// The mutating verbs are wired to an explicit 405 rather than left to fall through to a bare 404,
// since "this resource genuinely doesn't support that verb" and "this resource doesn't exist" are
// different facts worth telling a client apart.
@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get()
  findAll() {
    return this.categories.findAll();
  }

  @Post()
  createNotSupported(): never {
    throw new MethodNotAllowedException('categories are read-only in this API');
  }

  @Patch(':id')
  updateNotSupported(): never {
    throw new MethodNotAllowedException('categories are read-only in this API');
  }

  @Delete(':id')
  deleteNotSupported(): never {
    throw new MethodNotAllowedException('categories are read-only in this API');
  }
}
