import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module';
import { GraphqlController } from './graphql.controller';

@Module({
  imports: [ProductsModule],
  controllers: [GraphqlController],
})
export class GraphqlModule {}
