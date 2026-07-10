import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  async assertExists(id: string): Promise<Category> {
    const category = await this.tryFind(id);
    if (!category) throw new NotFoundException(`category ${id} not found`);
    return category;
  }

  // Non-throwing lookup — used by batch create (M12) where an unknown category is one of
  // several independent per-item failure reasons, not a request-ending 404. A malformed
  // (non-UUID) id also just resolves to `null` here rather than a Postgres cast error, since
  // TypeORM's `findOne` on a uuid column would otherwise throw on bad input.
  async tryFind(id: string): Promise<Category | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return this.categories.findOne({ where: { id } });
  }
}
