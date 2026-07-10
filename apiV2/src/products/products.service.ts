import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Product } from '../entities/product.entity';
import { CategoriesService } from '../categories/categories.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { BatchProductItemDto } from './dto/batch-create-products.dto';
import { BatchCreateProductsResult, BatchItemResult } from './dto/batch-create-products-result';
import { isForeignKeyViolation } from '../common/db-errors';

// ETag values are just the row's version number, quoted per RFC7232 — opaque to the client,
// meaningful only as an equality check against what this API itself issued.
export function etagFor(product: Product): string {
  return `"${product.version}"`;
}

export interface PaginatedProducts {
  data: Product[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

const SORTABLE_COLUMNS: Record<string, string> = {
  name: 'product.name',
  price: 'product.price',
  stock: 'product.stock',
};

function applySort(qb: SelectQueryBuilder<Product>, sort: string | undefined): void {
  if (!sort) {
    qb.orderBy('product.name', 'ASC');
    return;
  }
  const descending = sort.startsWith('-');
  const field = descending ? sort.slice(1) : sort;
  const column = SORTABLE_COLUMNS[field];
  if (!column) {
    throw new BadRequestException(
      `cannot sort by "${field}" — choose one of ${Object.keys(SORTABLE_COLUMNS).join(', ')}`,
    );
  }
  qb.orderBy(column, descending ? 'DESC' : 'ASC');
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    private readonly categories: CategoriesService,
  ) {}

  // Filter (categoryId), full-text search (q), sort, and offset pagination (page+pageSize) —
  // plan_v2.md Cluster 4's query cluster. page/pageSize are only meaningful together; when
  // neither is given this returns a bare array, the same shape M1-M3's tests already assert.
  async findAll(query: FindProductsQueryDto): Promise<Product[] | PaginatedProducts> {
    const qb = this.products.createQueryBuilder('product');

    if (query.categoryId) {
      qb.andWhere('product.category_id = :categoryId', { categoryId: query.categoryId });
    }
    if (query.q) {
      qb.andWhere(
        `to_tsvector('english', product.name || ' ' || product.description) @@ plainto_tsquery('english', :q)`,
        { q: query.q },
      );
    }

    const paginated = query.page !== undefined && query.pageSize !== undefined;
    const total = paginated ? await qb.clone().getCount() : undefined;

    applySort(qb, query.sort);
    if (paginated) {
      qb.skip((query.page! - 1) * query.pageSize!).take(query.pageSize!);
    }

    const data = await qb.getMany();

    if (paginated) {
      return {
        data,
        page: query.page!,
        pageSize: query.pageSize!,
        total: total!,
        totalPages: Math.max(1, Math.ceil(total! / query.pageSize!)),
      };
    }
    return data;
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

  // Batch create (M12, plan_v2.md Part E): each item is validated and persisted independently —
  // one bad row never blocks the good ones (207 Multi-Status), unlike the all-or-nothing
  // behavior a plain array-body POST would give via the global ValidationPipe. Three
  // independent per-item failure reasons: invalid price, unknown category, and a name reused
  // earlier in the same batch payload (not a DB-level constraint — products may share names
  // across separate, non-batched creates).
  async createBatch(items: BatchProductItemDto[]): Promise<BatchCreateProductsResult> {
    const results: BatchItemResult[] = [];
    const seenNames = new Set<string>();

    for (const item of items) {
      if (item.price < 0) {
        results.push({ ok: false, reason: 'invalid price' });
        continue;
      }
      if (seenNames.has(item.name)) {
        results.push({ ok: false, reason: 'duplicate name in batch' });
        continue;
      }
      seenNames.add(item.name);

      const category = await this.categories.tryFind(item.categoryId);
      if (!category) {
        results.push({ ok: false, reason: 'unknown category' });
        continue;
      }

      const product = this.products.create({
        name: item.name,
        description: item.description ?? '',
        price: String(item.price),
        stock: item.stock,
        categoryId: item.categoryId,
      });
      const saved = await this.products.save(product);
      results.push({ ok: true, id: saved.id });
    }

    const succeeded = results.filter((r) => r.ok).length;
    return { results, succeeded, failed: results.length - succeeded };
  }

  // Product-image upload (M6): metadata only, no real file persistence/serving (see
  // Product entity's comment for why).
  async attachImage(id: string, file: Express.Multer.File): Promise<Product> {
    const product = await this.findOne(id);
    product.imageFilename = file.originalname;
    product.imageMimeType = file.mimetype;
    product.imageSizeBytes = file.size;
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
