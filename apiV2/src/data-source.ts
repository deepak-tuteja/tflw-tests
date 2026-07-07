import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from './entities/user.entity';
import { Category } from './entities/category.entity';
import { Product } from './entities/product.entity';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Review } from './entities/review.entity';

// Used by both the TypeORM CLI (migration:generate/run) and NestJS's
// TypeOrmModule.forRootAsync at bootstrap, so schema/migrations never drift
// from what the app actually connects with.
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'testflow_tests',
  entities: [User, Category, Product, Order, OrderItem, Review],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  synchronize: false,
});

export default AppDataSource;
