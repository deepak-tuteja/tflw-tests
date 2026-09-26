import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { buildSchema, graphql } from 'graphql';
import { ProductsService } from '../products/products.service';

// tflw `M242` `C` (`D1328`) / this repo's `S-4a`: a GraphQL surface for `body graphql` to be graded
// against. The reference implementation (`graphql`, MIT by its LICENSE file, no dependencies)
// behind one POST route — the smallest server that answers GraphQL-over-HTTP's POST shape, and
// the same data the REST routes serve, so a journey can check one against the other.
//
// A query that fails validation answers 200 with `errors`, which is the GraphQL-over-HTTP
// convention for `application/json` and the case a tflw test asserts with `body.errors`.
const schema = buildSchema(`
  type Product {
    id: ID!
    name: String!
    price: String!
    stock: Int!
  }
  type Query {
    product(id: ID!): Product
    products(q: String): [Product!]!
  }
`);

@ApiTags('graphql')
@Controller('graphql')
export class GraphqlController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @HttpCode(200)
  async execute(
    @Body()
    body: {
      query?: unknown;
      variables?: Record<string, unknown>;
      operationName?: string;
    },
  ) {
    if (typeof body?.query !== 'string')
      return {
        errors: [{ message: 'a GraphQL request carries a `query` string' }],
      };
    const rootValue = {
      product: async ({ id }: { id: string }) => {
        try {
          return await this.products.findOne(id);
        } catch {
          return null;
        }
      },
      products: async ({ q }: { q?: string }) => {
        const found = await this.products.findAll(q === undefined ? {} : { q });
        return Array.isArray(found) ? found : found.data;
      },
    };
    return graphql({
      schema,
      source: body.query,
      rootValue,
      variableValues: body.variables ?? null,
      operationName: body.operationName ?? null,
    });
  }
}
