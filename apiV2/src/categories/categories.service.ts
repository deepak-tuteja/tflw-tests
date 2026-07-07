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
    const category = await this.categories.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`category ${id} not found`);
    return category;
  }
}
