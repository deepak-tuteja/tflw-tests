import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';

export interface CategoryTreeNode {
  id: string;
  name: string;
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category) private readonly categories: Repository<Category>,
  ) {}

  findAll(): Promise<Category[]> {
    return this.categories.find({ order: { name: 'ASC' } });
  }

  // M13 (plan_v2.md Part F): assembled in memory from one flat query — the catalog's category
  // count is small (single/low-double digits), so this beats a recursive CTE for the actual
  // shape of this data without adding real cost.
  async findTree(): Promise<CategoryTreeNode[]> {
    const all = await this.categories.find({ order: { name: 'ASC' } });
    const nodes = new Map<string, CategoryTreeNode>();
    for (const cat of all) nodes.set(cat.id, { id: cat.id, name: cat.name, children: [] });

    const roots: CategoryTreeNode[] = [];
    for (const cat of all) {
      const node = nodes.get(cat.id)!;
      const parent = cat.parentId ? nodes.get(cat.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
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
