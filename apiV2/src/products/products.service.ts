import {
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { CategoriesService } from '../categories/categories.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { isForeignKeyViolation } from '../common/db-errors';

// ETag values are just the row's version number, quoted per RFC7232 — opaque to the client,
// meaningful only as an equality check against what this API itself issued.
export function etagFor(product: Product): string {
  return `"${product.version}"`;
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly categories: CategoriesService,
  ) {}

  findAll(): Promise<Product[]> {
    return this.products.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.products.findOne({ where: { id } });
    if (!product) throw new NotFoundException('product not found');
    return product;
  }

  async create(dto: CreateProductDto): Promise<Product> {
    await this.categories.assertExists(dto.categoryId);
    const product = this.products.create({
      name: dto.name,
      description: dto.description ?? '',
      price: String(dto.price),
      stock: dto.stock,
      categoryId: dto.categoryId,
    });
    return this.products.save(product);
  }

  async update(id: string, dto: UpdateProductDto, ifMatch?: string): Promise<Product> {
    const product = await this.findOne(id);

    // Conditional-request check (RFC7232 §3.1): only enforced when the caller sends If-Match at
    // all, so plain unconditional PATCHes keep working — this is optimistic concurrency, not a
    // mandatory lock.
    if (ifMatch !== undefined && ifMatch !== etagFor(product)) {
      throw new PreconditionFailedException(
        'product has been modified since you last read it — refetch and retry with its current ETag',
      );
    }

    if (dto.categoryId) await this.categories.assertExists(dto.categoryId);

    if (dto.name !== undefined) product.name = dto.name;
    if (dto.description !== undefined) product.description = dto.description;
    if (dto.price !== undefined) product.price = String(dto.price);
    if (dto.stock !== undefined) product.stock = dto.stock;
    if (dto.categoryId !== undefined) product.categoryId = dto.categoryId;

    return this.products.save(product);
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    try {
      await this.products.remove(product);
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw new ConflictException(
          'product is referenced by existing order items and cannot be deleted',
        );
      }
      throw err;
    }
  }
}
